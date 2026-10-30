// Opt-in only: synthetic records on an independently confirmed development
// endpoint. Supports the approved application branch or a separate test DB.
// Never drops schemas or deletes existing project/application records.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ParticipantRepository } from '../src/participants/repository.ts';
import { PersistentAuth, opaqueToken, hashToken, BROWSER_COOKIE, SESSION_COOKIE } from '../src/participants/auth.ts';
import { integrationDatabaseUrl, developmentMigrationDatabaseUrl } from '../src/participants/database-config.ts';
import { authRequest, participantRequest } from '../src/participants/http.ts';
import { serializeNep413 } from '../src/identity/nep413.ts';
import type { IdentityChallenge } from '../src/identity/types.ts';
import type { Query } from '../src/participants/database.ts';

const enabled = process.env.YAWRD_TEST_DATABASE_DEVELOPMENT === '1' || process.env.YAWRD_TEST_DATABASE_DISPOSABLE === '1';
test('real PostgreSQL persistence, atomicity and authorization', { skip: !enabled }, async t => {
  const targetUrl = integrationDatabaseUrl();
  if (!targetUrl) throw new Error('integration_database_not_configured');
  const { neon } = await import('@neondatabase/serverless');
  const { migrate } = await import('../scripts/migrations.mjs');
  const migrationUrl = developmentMigrationDatabaseUrl();
  const migrationTarget = new URL(migrationUrl), runtimeTarget = new URL(targetUrl);
  assert.equal(migrationTarget.hostname.replace('-pooler.', '.'), runtimeTarget.hostname.replace('-pooler.', '.'), 'Migration and runtime must use the same confirmed development endpoint');
  assert.equal(migrationTarget.pathname, runtimeTarget.pathname, 'Migration and runtime must use the same database');
  const sql = neon(migrationUrl);
  const runtime = neon(targetUrl);
  const runtimeQuery: Query = async (text, values = []) => {
    try { return await runtime.query(text, values, { fetchOptions: { signal: AbortSignal.timeout(15000) } }); }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unavailable';
      throw new Error(`integration_database_error_${code}`);
    }
  };
  const query: Query = async (text, values = []) => {
    try { return await sql.query(text, values, { fetchOptions: { signal: AbortSignal.timeout(15000) } }); }
    catch (error) {
      // Database details may contain hashed tokens or connection metadata.
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unavailable';
      throw new Error(`integration_database_error_${code}`);
    }
  };
  try {
    await migrate(sql);
    await migrate(sql); // Repeatable with the same checksums; does not lose records.
  } catch { throw new Error('integration_migration_failed'); }
  const repo = new ParticipantRepository(runtimeQuery);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const id = `dev-07b-${suffix}`;
  const creator = `creator-${suffix}.testnet`, alice = `alice-${suffix}.testnet`, bob = `bob-${suffix}.testnet`;
  const content = `RESTRICTED-${suffix}`;
  await query(`INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards,published_at)
    VALUES ('testnet',$1,$2,'DEVELOPMENT ONLY — 07B synthetic test','Synthetic public description; not a genuine Yawrd','["Test"]'::jsonb,'Synthetic participation','No rewards',clock_timestamp())`, [id, creator]);
  await query("INSERT INTO yawrd.restricted_content(network,project_id,content) VALUES ('testnet',$1,$2)", [id, content]);
  // Session fixture is inserted directly by the test's owner connection. It is
  // never exposed via a runtime bypass or wallet signing route.
  async function session(account: string, expired = false) {
    const challenge = opaqueToken(), token = opaqueToken();
    await query(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
      VALUES ($1,$2,$3,'testnet','https://test.example','synthetic','synthetic','synthetic',statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`, [challenge, hashToken(opaqueToken()), account]);
    await query(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at)
      VALUES ($1,$2,'testnet',$3,'synthetic',1,'synthetic',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour')`, [hashToken(token), challenge, account]);
    if (!expired) await query("UPDATE yawrd.sessions SET created_at=statement_timestamp(),expires_at=statement_timestamp()+interval '1 hour' WHERE token_hash=$1", [hashToken(token)]);
    return hashToken(token);
  }
  const creatorHash = await session(creator), aliceHash = await session(alice), bobHash = await session(bob), expiredHash = await session(alice, true);
  let applicationId = '';
  await t.test('unpublished projects, fixture reservation and network isolation', async () => {
    const privateId = `${id}-private`;
    await query(`INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards)
      VALUES ('testnet',$1,$2,'DEVELOPMENT ONLY — unpublished synthetic test','Not public','[]','No applications','No rewards')`, [privateId, creator]);
    assert.equal(await repo.project(privateId), null);
    await assert.rejects(repo.view(privateId, creatorHash), /not_found/);
    await assert.rejects(repo.apply(privateId, aliceHash, 'Hello', true), /not_found/);
    await assert.rejects(query(`INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards)
      VALUES ('testnet','the-common-table',$1,'Fixture collision','No','[]','No','No')`, [creator]), /integration_database_error_23514/);
    await assert.rejects(query(`INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards)
      VALUES ('mainnet',$1,$2,'Wrong network','No','[]','No','No')`, [id, creator]), /integration_database_error_23514/);
    await assert.rejects(query('UPDATE yawrd.projects SET creator_account_id=$2 WHERE id=$1', [id, bob]), /integration_database_error_23514/);
  });
  await t.test('expired and revoked sessions cannot apply or read restricted content', async () => {
    assert.equal((await repo.view(id, expiredHash)).accountId, null);
    await assert.rejects(repo.apply(id, expiredHash, 'Hello', true), /sign_in_required/);
    const revoked = await session(alice);
    await new PersistentAuth(runtimeQuery, async () => { throw new Error(); }).logout(revoked);
    assert.equal((await repo.view(id, revoked)).restrictedContent, null);
    await assert.rejects(repo.apply(id, revoked, 'Hello', true), /sign_in_required/);
  });
  await t.test('concurrent submissions persist exactly one application and original consent', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => repo.apply(id, aliceHash, 'Original introduction', true)));
    applicationId = results[0].application!.id;
    assert.ok(results.every(v => v.application?.id === applicationId));
    const [row] = await query('SELECT count(*)::int AS count FROM yawrd.applications WHERE project_id=$1', [id]);
    assert.equal(row.count, 1);
    assert.equal((await repo.apply(id, aliceHash, 'Changed', true)).application?.introduction, 'Original introduction');
  });
  await t.test('public, pending and other wallets cannot read restricted data or review', async () => {
    for (const hash of [null, aliceHash, bobHash, expiredHash]) assert.equal((await repo.view(id, hash)).restrictedContent, null);
    assert.deepEqual((await repo.view(id, bobHash)).applications, []);
    assert.equal((await repo.view(id, bobHash)).application, null);
    await assert.rejects(repo.review(id, aliceHash, applicationId, 'approved'), /creator_only/);
    await assert.rejects(repo.review(id, bobHash, applicationId, 'approved'), /creator_only/);
    await assert.rejects(query(`INSERT INTO yawrd.review_decisions(application_id,network,project_id,reviewer_account_id,decision)
      VALUES ($1::uuid,'testnet',$2,$3,'approved')`, [applicationId, id, bob]), /integration_database_error_23514/);
  });
  await t.test('concurrent creator decisions have one immutable winner; retries are deterministic', async () => {
    const results = await Promise.allSettled([repo.review(id, creatorHash, applicationId, 'approved'), repo.review(id, creatorHash, applicationId, 'rejected')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const [record] = await query('SELECT decision, reviewer_account_id FROM yawrd.review_decisions WHERE application_id=$1::uuid', [applicationId]);
    assert.equal(record.reviewer_account_id, creator);
    await repo.review(id, creatorHash, applicationId, record.decision);
    await assert.rejects(repo.review(id, creatorHash, applicationId, record.decision === 'approved' ? 'rejected' : 'approved'), /decision_conflict/);
    await assert.rejects(query("UPDATE yawrd.review_decisions SET decision='rejected' WHERE application_id=$1::uuid", [applicationId]), /integration_database_error_23514/);
    await assert.rejects(query('DELETE FROM yawrd.review_decisions WHERE application_id=$1::uuid', [applicationId]), /integration_database_error_23514/);
    await assert.rejects(query("UPDATE yawrd.applications SET introduction='changed' WHERE id=$1::uuid", [applicationId]), /integration_database_error_23514/);
    await assert.rejects(query('DELETE FROM yawrd.applications WHERE id=$1::uuid', [applicationId]), /integration_database_error_23514/);
    const view = await repo.view(id, aliceHash);
    assert.equal(view.restrictedContent, record.decision === 'approved' ? content : null);
    assert.equal((await repo.view(id, creatorHash)).restrictedContent, content);
  });
  await t.test('approved, rejected and pending authorizations remain separate', async () => {
    await repo.apply(id, bobHash, 'Bob introduction', true);
    const bobApp = (await repo.view(id, bobHash)).application!;
    await repo.review(id, creatorHash, bobApp.id, 'approved');
    assert.equal((await repo.view(id, bobHash)).restrictedContent, content);
    assert.equal((await repo.view(id, expiredHash)).restrictedContent, null);
    const rejectedAccount = `rejected-${suffix}.testnet`, pendingAccount = `pending-${suffix}.testnet`;
    const rejectedHash = await session(rejectedAccount), pendingHash = await session(pendingAccount);
    const rejected = await repo.apply(id, rejectedHash, 'Reject this synthetic application', true);
    await repo.review(id, creatorHash, rejected.application!.id, 'rejected');
    await repo.apply(id, pendingHash, 'Keep this synthetic application pending', true);
    assert.equal((await repo.view(id, rejectedHash)).application?.status, 'rejected');
    assert.equal((await repo.view(id, rejectedHash)).restrictedContent, null);
    assert.equal((await repo.view(id, pendingHash)).application?.status, 'pending');
    assert.equal((await repo.view(id, pendingHash)).restrictedContent, null);
  });
  await t.test('application and decision survive a new Node process with a fresh repository', async () => {
    const child = spawnSync(process.execPath, ['--import', './test/register-tsx.mjs', '--input-type=module', '-e', `
      import { neon } from '@neondatabase/serverless';
      import { ParticipantRepository } from './src/participants/repository.ts';
      const sql=neon(process.env.YAWRD_TEST_DATABASE_URL);
      const repo=new ParticipantRepository((text,values)=>sql.query(text,values));
      const view=await repo.view(process.env.YAWRD_TEST_PROJECT,process.env.YAWRD_TEST_SESSION_HASH);
      if(view.application?.status!=='approved'||!view.restrictedContent) process.exit(2);
    `], { env: { ...process.env, YAWRD_MIGRATION_DATABASE_URL: undefined, YAWRD_TEST_DATABASE_URL: targetUrl, YAWRD_TEST_PROJECT: id, YAWRD_TEST_SESSION_HASH: bobHash }, timeout: 30000, encoding: 'utf8' });
    assert.equal(child.status, 0, 'Fresh process must load the persisted approved application');
  });
  await t.test('real database challenge claiming is atomic across separate auth services', async () => {
    const auth = new PersistentAuth(runtimeQuery, async () => { throw new Error('No real proof in this test'); });
    const browser = opaqueToken();
    const c = await auth.issue(alice, 'testnet', 'https://test.example', browser);
    const args = [c.id, hashToken(browser)];
    const claims = await Promise.all(Array.from({ length: 6 }, () => runtimeQuery('UPDATE yawrd.auth_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND browser_hash=$2 AND consumed_at IS NULL RETURNING id', args)));
    assert.equal(claims.filter(rows => rows.length === 1).length, 1);
  });

  // Real cryptography and PostgreSQL, with synthetic key-authorization evidence
  // injected only in this test process. Never a real wallet or RPC acceptance.
  const pair = generateKeyPairSync('ed25519');
  const raw = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = BigInt(`0x${raw.toString('hex')}`), encoded = '';
  while (number) { encoded = alphabet[Number(number % BigInt(58))] + encoded; number /= BigInt(58); }
  for (const byte of raw) { if (byte) break; encoded = '1' + encoded; }
  function proof(c: IdentityChallenge) {
    return { accountId: c.accountId, publicKey: `ed25519:${encoded}`, signature: sign(null, createHash('sha256').update(serializeNep413(c.message, Buffer.from(c.nonce, 'base64'), c.recipient)).digest(), pair.privateKey).toString('base64') };
  }
  const origin = 'https://test.example';
  const auth = new PersistentAuth(runtimeQuery, async () => ({ blockHeight: 1, blockHash: 'synthetic-07b-evidence' }));
  function request(action: string, data: object, binding = '', requestOrigin = origin) {
    return new Request(`${origin}/api/auth/${action}`, { method: 'POST', headers: { host: 'test.example', origin: requestOrigin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', cookie: binding }, body: JSON.stringify(data) });
  }
  await t.test('HTTP challenge, cryptographic verification, session rotation and logout persist in PostgreSQL', async () => {
    const account = `auth-${suffix}.testnet`;
    const challengeResponse = await authRequest(request('challenge', { accountId: account, network: 'testnet' }), 'challenge', auth, origin);
    assert.equal(challengeResponse.status, 200);
    const binding = challengeResponse.headers.get('set-cookie')!.split(';')[0];
    assert.ok(binding.startsWith(`${BROWSER_COOKIE}=`));
    const { challenge } = await challengeResponse.json();
    const verifyBody = { challengeId: challenge.id, accountId: account, network: 'testnet', proof: proof(challenge) };
    const verified = await authRequest(request('verify', verifyBody, binding), 'verify', auth, origin);
    assert.equal(verified.status, 200);
    assert.ok(/HttpOnly; Secure; SameSite=Strict; Max-Age=3600/.test(verified.headers.get('set-cookie') ?? ''));
    assert.deepEqual(await verified.json(), { accountId: account, network: 'testnet', expiresIn: 3600 });
    const sessionCookie = verified.headers.get('set-cookie')!.split(';')[0];
    const hash = hashToken(sessionCookie.slice(SESSION_COOKIE.length + 1));
    assert.equal((await repo.view(id, hash)).accountId, account);
    assert.equal((await authRequest(request('verify', verifyBody, binding), 'verify', auth, origin)).status, 401);

    const next = await authRequest(request('challenge', { accountId: account, network: 'testnet' }, sessionCookie), 'challenge', auth, origin);
    const nextBinding = next.headers.get('set-cookie')!.split(';')[0];
    const { challenge: nextChallenge } = await next.json();
    const rotated = await authRequest(request('verify', { challengeId: nextChallenge.id, accountId: account, network: 'testnet', proof: proof(nextChallenge) }, `${sessionCookie}; ${nextBinding}`), 'verify', auth, origin);
    assert.equal(rotated.status, 200);
    const nextSession = rotated.headers.get('set-cookie')!.split(';')[0];
    const nextHash = hashToken(nextSession.slice(SESSION_COOKIE.length + 1));
    assert.equal((await repo.view(id, hash)).accountId, null);
    assert.equal((await repo.view(id, nextHash)).accountId, account);
    const logout = await authRequest(request('logout', {}, nextSession), 'logout', auth, origin);
    assert.equal(logout.status, 200);
    assert.equal((await repo.view(id, nextHash)).accountId, null);
    const [counts] = await query('SELECT count(*)::int AS count, bool_and(length(token_hash)=64 AND revoked_at IS NOT NULL) AS revoked FROM yawrd.sessions WHERE account_id=$1', [account]);
    assert.equal(counts.count, 2);
    assert.equal(counts.revoked, true);
  });
  await t.test('PostgreSQL authentication rejects browser mismatch, invalid proof, expiry and key-verifier failure', async () => {
    const account = `negative-${suffix}.testnet`;
    const browser = opaqueToken();
    let c = await auth.issue(account, 'testnet', origin, browser);
    await assert.rejects(auth.verify(c.id, opaqueToken(), account, 'testnet', origin, proof(c), null), /unknown_challenge/);
    await auth.verify(c.id, browser, account, 'testnet', origin, proof(c), null);
    for (const kind of ['proof', 'expiry', 'rpc'] as const) {
      const clock = kind === 'expiry' ? () => Date.now() - 300001 : Date.now;
      const issuer = new PersistentAuth(runtimeQuery, async () => { throw new Error('synthetic_key_denial'); }, clock);
      c = await issuer.issue(account, 'testnet', origin, browser);
      const verifier = kind === 'rpc' ? issuer : auth;
      const signed = kind === 'proof' ? { ...proof(c), signature: Buffer.alloc(64).toString('base64') } : proof(c);
      await assert.rejects(verifier.verify(c.id, browser, account, 'testnet', origin, signed, null));
      await assert.rejects(auth.verify(c.id, browser, account, 'testnet', origin, proof(c), null), /unknown_challenge/);
    }
    const [counts] = await query('SELECT count(*)::int AS count FROM yawrd.sessions WHERE account_id=$1', [account]);
    assert.equal(counts.count, 1);
  });
  await t.test('challenge reissuance burns the old challenge and database rate limiting rejects the eleventh attempt', async () => {
    const account = `rate-${suffix}.testnet`, browser = opaqueToken();
    const old = await auth.issue(account, 'testnet', origin, browser);
    await auth.issue(account, 'testnet', origin, browser);
    await assert.rejects(auth.verify(old.id, browser, account, 'testnet', origin, proof(old), null), /unknown_challenge/);
    for (let i = 2; i < 10; i++) await auth.issue(account, 'testnet', origin, browser);
    await assert.rejects(auth.issue(account, 'testnet', origin, browser), /too_many_challenges/);
  });
  await t.test('live HTTP workflow protects consent, creator decisions, restricted reads and cross-origin writes', async () => {
    const token = opaqueToken(), c = await auth.issue(`http-${suffix}.testnet`, 'testnet', origin, token);
    const signedIn = await auth.verify(c.id, token, c.accountId, 'testnet', origin, proof(c), null);
    const binding = `${SESSION_COOKIE}=${signedIn.token}`;
    const endpoint = (data: object, requestOrigin = origin) => request('apply', data, binding, requestOrigin);
    assert.equal((await participantRequest(endpoint({ introduction: 'Synthetic HTTP application', consent: true }, 'https://cross-origin.example'), id, 'apply', repo, origin)).status, 403);
    assert.equal((await participantRequest(endpoint({ introduction: 'Synthetic HTTP application', consent: false }), id, 'apply', repo, origin)).status, 400);
    const applied = await participantRequest(endpoint({ introduction: 'Synthetic HTTP application', consent: true }), id, 'apply', repo, origin);
    assert.equal(applied.status, 200);
    const view = await applied.json();
    assert.equal(view.application.status, 'pending');
    assert.equal(view.restrictedContent, null);
    const denied = await participantRequest(endpoint({ applicationId: view.application.id, decision: 'approved' }), id, 'review', repo, origin);
    assert.equal(denied.status, 403);
    await repo.review(id, creatorHash, view.application.id, 'approved');
    const read = () => new Request(`${origin}/api/yawrd/${id}/state`, { headers: { host: 'test.example', cookie: binding } });
    const approved = await participantRequest(read(), id, 'state', repo, origin);
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).restrictedContent, content);
    await auth.logout(hashToken(signedIn.token));
    const loggedOut = await participantRequest(read(), id, 'state', repo, origin);
    assert.equal((await loggedOut.json()).restrictedContent, null);
  });
  console.log(`Retained DEVELOPMENT ONLY 07B fixture: ${id}`);
});
