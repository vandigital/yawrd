// Real local HTTP/SSR/browser checks. Synthetic sessions are inserted only via
// the separate operator login, on a synthetic project, never on YAW-001.
// No real wallet approval, key authorization or successful human sign-in.
import './load-migration-environment.mjs';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { developmentDatabaseUrl, developmentMigrationDatabaseUrl } from '../src/participants/database-config.ts';

const origin = 'http://localhost:3000';
const production = 'http://localhost:3099';
const directory = new URL('../docs/verification/milestone-07b/', import.meta.url);
const results = [];
const tokens = [];
let server, sql, browser;
let stage = 'configuration';
let lastBrowserCommand = '';
const opaque = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function passed(check) { results.push({ check, passed: true }); console.log(`Passed: ${check}`); }

async function listening(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(700) }); return true; } catch { return false; }
}
async function stop() {
  if (!server) return;
  const child = server;
  server = null;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), pause(8000).then(() => child.kill('SIGKILL'))]);
}
async function start(mode) {
  const url = mode === 'dev' ? origin : production;
  assert.equal(await listening(url), false, 'Refuse to replace an existing server');
  const env = { ...process.env, NODE_ENV: mode === 'dev' ? 'development' : 'production' };
  delete env.YAWRD_MIGRATION_DATABASE_URL;
  delete env.YAWRD_DATABASE_URL;
  env.YAWRD_ENABLE_DEV_IDENTITY = mode === 'dev' ? '0' : '1';
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', mode === 'dev' ? 'dev' : 'start', ...(mode === 'dev' ? ['--webpack'] : []), '--hostname', 'localhost', '--port', mode === 'dev' ? '3000' : '3099'], { env, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error('local_server_start_failed');
    if (await listening(url)) return;
    await pause(250);
  }
  throw new Error('local_server_timeout');
}
async function http(path, data, token, base = origin, extra = {}) {
  return fetch(base + path, {
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }),
    headers: { ...(data === undefined ? {} : { origin: base, 'content-type': 'application/json' }), ...(token ? { cookie: `__Host-yawrd_session=${token}` } : {}), ...extra },
    signal: AbortSignal.timeout(30000),
  });
}
async function state(path, token) {
  const response = await http(path, undefined, token);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.ok(response.headers.get('vary')?.split(',').some(value => value.trim().toLowerCase() === 'cookie'));
  return response.json();
}
async function session(account) {
  const challenge = opaque(), token = opaque();
  await sql.transaction([
    sql.query(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
      VALUES ($1,$2,$3,'testnet',$4,'DEVELOPMENT ONLY HTTP session fixture','synthetic','synthetic',statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`, [challenge, hash(opaque()), account, origin]),
    sql.query(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash)
      VALUES ($1,$2,'testnet',$3,'synthetic',1,'DEVELOPMENT ONLY')`, [hash(token), challenge, account]),
  ]);
  tokens.push(token);
  return token;
}

async function browserChecks(projectPath, syntheticPath, syntheticToken, marker) {
  const profile = await mkdtemp(join(tmpdir(), 'yawrd-07b-final-browser-'));
  try {
    browser = spawn('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
    let port;
    for (let i = 0; i < 100; i++) {
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); }
    }
    assert.ok(port);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await once(ws, 'open');
    let id = 0;
    const pending = new Map();
    let stateResponses = 0;
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Network.responseReceived' && message.params.response.url.includes('/state') && message.params.response.status === 200) stateResponses++;
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    });
    async function cdp(method, params = {}, retry = 0) {
      lastBrowserCommand = method;
      const requestId = ++id;
      const response = new Promise(resolve => pending.set(requestId, resolve));
      ws.send(JSON.stringify({ id: requestId, method, params }));
      const message = await Promise.race([response, pause(20000).then(() => { throw new Error('browser_timeout'); })]);
      // Navigation can destroy the old execution context between a readiness
      // poll and its evaluation. Retry only this transport race, not assertions.
      if (message.error?.code === -32000 && method === 'Runtime.evaluate' && retry < 5) {
        await pause(100);
        return cdp(method, params, retry + 1);
      }
      assert.equal(message.error, undefined, `CDP ${method} must succeed`);
      return message.result;
    }
    await cdp('Page.enable');
    await cdp('Network.enable');
    async function page(path, width, label, restricted = false) {
      stage = `browser ${label} ${width}px navigation`;
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1500, deviceScaleFactor: 1, mobile: width < 500 });
      await cdp('Page.navigate', { url: origin + path });
      let snapshot;
      for (let i = 0; i < 200; i++) {
        const result = await cdp('Runtime.evaluate', { expression: `JSON.stringify({ready:document.readyState,text:document.body?.innerText,overflow:document.documentElement?.scrollWidth>innerWidth,secure:window.isSecureContext})`, returnByValue: true });
        snapshot = JSON.parse(result.result.value);
        if (snapshot.ready === 'complete' && snapshot.text?.includes(path === '/' ? 'Create your Yawrd' : path.includes('the-common-table') ? 'The Common Table' : path.includes('dev-07b-http') ? 'DEVELOPMENT ONLY' : 'YAW-001')) break;
        await pause(100);
      }
      stage = `browser ${label} ${width}px document readiness`;
      assert.equal(snapshot.ready, 'complete');
      assert.ok(snapshot.text?.includes(path === '/' ? 'Create your Yawrd' : path.includes('the-common-table') ? 'The Common Table' : path.includes('dev-07b-http') ? 'DEVELOPMENT ONLY' : 'YAW-001'));
      stage = `browser ${label} ${width}px overflow`;
      assert.equal(snapshot.overflow, false);
      stage = `browser ${label} ${width}px secure context`;
      assert.equal(snapshot.secure, true, 'Secure cookies require trustworthy localhost');
      if (path === projectPath) {
        assert.ok(snapshot.text.includes('yawrd1.testnet') && snapshot.text.includes('DEVELOPMENT ONLY'));
        assert.equal(snapshot.text.includes('Participant information'), false);
        // Click only the public refresh button. A successful API response
        // demonstrates hydration, without opening or signing in a wallet.
        const before = stateResponses;
        await cdp('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Refresh status')?.click()` });
        for (let i = 0; i < 100 && stateResponses === before; i++) await pause(100);
        assert.ok(stateResponses > before, 'Hydrated refresh must fetch state successfully');
      }
      if (restricted) assert.ok(snapshot.text.includes(marker));
      const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(new URL(`final-${label}-${width}.png`, directory), Buffer.from(screenshot.data, 'base64'));
      passed(`hydrated browser ${label} ${width}px; secure localhost; no overflow`);
    }
    await page(projectPath, 1280, 'yaw001-public');
    await page(projectPath, 390, 'yaw001-public');
    await page('/yawrd/the-common-table', 1280, 'fixture');
    await page('/', 1280, 'creation');
    const cookie = await cdp('Network.setCookie', { name: '__Host-yawrd_session', value: syntheticToken, url: origin, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' });
    assert.equal(cookie.success, true);
    await page(syntheticPath, 390, 'synthetic-approved', true);
    await cdp('Browser.close');
    ws.close();
  } finally {
    stage = 'isolated browser cleanup';
    if (browser) {
      const child = browser; browser = null;
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await Promise.race([once(child, 'exit'), pause(3000).then(() => child.kill('SIGKILL'))]);
      }
    }
    // Chromium helpers may briefly finish writing after the main process exits.
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

try {
  assert.equal(process.env.YAWRD_APP_ORIGIN, origin);
  assert.equal(decodeURIComponent(new URL(developmentDatabaseUrl()).username), 'yawrd_07b_runtime');
  const mode = (await stat(new URL('../.env.migrations.local', import.meta.url))).mode & 0o777;
  assert.equal(mode, 0o600);
  const appOnly = spawn(process.execPath, ['--import', './scripts/load-environment.mjs', '--input-type=module', '-e', 'if(process.env.YAWRD_MIGRATION_DATABASE_URL)process.exit(2)'], { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !['YAWRD_MIGRATION_DATABASE_URL', '__NEXT_PROCESSED_ENV'].includes(key))), stdio: 'ignore' });
  assert.equal((await once(appOnly, 'exit'))[0], 0);
  passed('runtime environment excludes migration credential; operator file mode 0600');
  stage = 'synthetic database setup';
  sql = neon(developmentMigrationDatabaseUrl());
  const suffix = randomBytes(6).toString('hex');
  const project = `dev-07b-http-${suffix}`;
  const creator = `creator-http-${suffix}.testnet`;
  const applicant = `applicant-http-${suffix}.testnet`;
  const rejected = `rejected-http-${suffix}.testnet`;
  const marker = `DEVELOPMENT ONLY restricted access marker ${suffix}`;
  await sql.transaction([
    sql.query(`INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards,published_at) VALUES ('testnet',$1,$2,'DEVELOPMENT ONLY — final HTTP acceptance','Synthetic session fixtures only; no human signing','[]','Synthetic test','No rewards',clock_timestamp())`, [project, creator]),
    sql.query("INSERT INTO yawrd.restricted_content(network,project_id,content) VALUES ('testnet',$1,$2)", [project, marker]),
  ]);
  const creatorToken = await session(creator), applicantToken = await session(applicant), rejectedToken = await session(rejected);
  const base = `/api/yawrd/${project}`;
  const publicPath = '/yawrd/dev-yaw-001';
  await mkdir(directory, { recursive: true });
  stage = 'initial development server startup';
  await start('dev');
  stage = 'YAW-001 public route assertions';
  for (const id of ['dev-yaw-001', 'dev-yaw-001-rejection']) {
    const page = await http(`/yawrd/${id}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes('YAW-001') && html.includes('Build Progress') && html.includes('yawrd1.testnet') && html.includes('DEVELOPMENT ONLY'));
    assert.equal(html.includes('This synthetic text confirms approved access'), false);
    assert.equal((await state(`/api/yawrd/${id}/state`)).restrictedContent, null);
  }
  passed('YAW-001 metadata and approved creator; public SSR/API omit restricted content');
  const challengeResponse = await http('/api/auth/challenge', { accountId: 'yawrd1.testnet', network: 'testnet' });
  assert.equal(challengeResponse.status, 200);
  const { challenge } = await challengeResponse.json();
  assert.equal(challenge.origin, origin);
  assert.ok(challenge.message.includes(`Origin: ${origin}`));
  const binding = challengeResponse.headers.get('set-cookie').split(';')[0];
  assert.match(challengeResponse.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  const invalidProof = { challengeId: challenge.id, accountId: 'yawrd1.testnet', network: 'testnet', proof: { accountId: 'yawrd1.testnet', publicKey: 'ed25519:invalid', signature: 'invalid' } };
  const verify = await http('/api/auth/verify', invalidProof, undefined, origin, { cookie: binding });
  assert.equal(verify.status, 401);
  assert.equal(verify.headers.has('set-cookie'), false);
  const replay = await http('/api/auth/verify', invalidProof, undefined, origin, { cookie: binding });
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).error, 'unknown_challenge');
  assert.equal((await http('/api/auth/challenge', { accountId: 'yawrd1.testnet', network: 'testnet' }, undefined, origin, { origin: 'https://untrusted.example' })).status, 403);
  passed('actual localhost challenge/message/cookie consistency; invalid proof, replay and cross-origin denial');
  const applied = await http(`${base}/apply`, { introduction: 'DEVELOPMENT ONLY applicant introduction', consent: true }, applicantToken);
  assert.equal(applied.status, 200);
  const pending = await applied.json();
  assert.equal(pending.accountId, applicant);
  assert.equal(pending.application.status, 'pending');
  assert.equal(pending.restrictedContent, null);
  const denied = await http(`${base}/review`, { applicationId: pending.application.id, decision: 'approved' }, applicantToken);
  assert.equal(denied.status, 403);
  passed('synthetic separate applicant submission, pending state and non-creator denial over real HTTP');
  await stop(); await start('dev');
  assert.equal((await state(`${base}/state`, applicantToken)).application.status, 'pending');
  passed('pending application persists across actual Next.js restart');
  assert.equal((await state(`${base}/state`, creatorToken)).role, 'creator');
  const approved = await http(`${base}/review`, { applicationId: pending.application.id, decision: 'approved' }, creatorToken);
  assert.equal(approved.status, 200);
  const rejectedApply = await http(`${base}/apply`, { introduction: 'DEVELOPMENT ONLY rejection test', consent: true }, rejectedToken);
  const rejectedApp = await rejectedApply.json();
  const reject = await http(`${base}/review`, { applicationId: rejectedApp.application.id, decision: 'rejected' }, creatorToken);
  assert.equal(reject.status, 200);
  await stop(); await start('dev');
  const approvedState = await state(`${base}/state`, applicantToken);
  assert.equal(approvedState.application.status, 'approved');
  assert.equal(approvedState.application.reviewerAccountId, creator);
  assert.equal(approvedState.restrictedContent, marker);
  const rejectedState = await state(`${base}/state`, rejectedToken);
  assert.equal(rejectedState.application.status, 'rejected');
  assert.equal(rejectedState.restrictedContent, null);
  for (const token of [undefined, rejectedToken]) {
    const page = await http(`/yawrd/${project}`, undefined, token);
    assert.equal((await page.text()).includes(marker), false);
  }
  assert.ok((await (await http(`/yawrd/${project}`, undefined, applicantToken)).text()).includes(marker));
  passed('creator approval/rejection persist after restart; SSR and API enforce approved/rejected/public access');
  await browserChecks(publicPath, `/yawrd/${project}`, applicantToken, marker);
  assert.equal((await http('/api/auth/logout', {}, applicantToken)).status, 200);
  assert.equal((await state(`${base}/state`, applicantToken)).restrictedContent, null);
  passed('logout revokes synthetic approved access');
  await stop(); await start('production');
  assert.equal((await http('/', undefined, undefined, production)).status, 200);
  assert.equal((await http('/yawrd/the-common-table', undefined, undefined, production)).status, 200);
  assert.equal((await http('/dev/identity', undefined, undefined, production)).status, 404);
  for (const route of ['/api/dev/identity/challenge', '/api/dev/identity/verify']) {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await fetch(production + route, { method, signal: AbortSignal.timeout(15000) });
      assert.ok(response.status >= 400);
      assert.equal(response.headers.has('set-cookie'), false);
    }
  }
  const blocked = await http('/api/auth/challenge', { accountId: 'yawrd1.testnet', network: 'testnet' }, undefined, production);
  assert.equal(blocked.status, 503);
  assert.equal(blocked.headers.has('set-cookie'), false);
  passed('production builder/fixture preserved; dev harness denied for all methods; local HTTP auth fails closed');
  const needles = [process.env.DATABASE_URL, process.env.YAWRD_MIGRATION_DATABASE_URL, new URL(process.env.DATABASE_URL).password, new URL(process.env.YAWRD_MIGRATION_DATABASE_URL).password];
  let assets = 0;
  async function scan(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await scan(child);
      else { const contents = await readFile(child); assert.equal(needles.some(value => value && contents.includes(Buffer.from(value))), false); assets++; }
    }
  }
  await scan('.next/static');
  passed(`browser asset credential scan (${assets} files; no secret values logged)`);
  await writeFile(new URL('final-acceptance-results.json', directory), JSON.stringify({ date: '2026-10-29', origin, runtimeRole: 'yawrd_07b_runtime', syntheticProject: project, humanWalletAcceptance: 'NOT RUN — explicit human actions required', results }, null, 2) + '\n');
  console.log('Automated acceptance checks passed. Real Meteor two-wallet acceptance remains outstanding.');
} catch (error) {
  console.error(JSON.stringify({ failureType: error?.name, code: error?.code, operator: error?.operator, browserCommand: lastBrowserCommand, actualType: typeof error?.actual, actualNumber: typeof error?.actual === 'number' ? error.actual : undefined, actualCode: typeof error?.actual?.code === 'number' ? error.actual.code : undefined }));
  console.error('Automated acceptance check failed at ' + stage + ' after: ' + (results.at(-1)?.check ?? 'initial setup') + '. Credentials, tokens, proofs and response bodies suppressed.');
  process.exitCode = 1;
} finally {
  await stop();
  if (sql && tokens.length) {
    try { await sql.query('UPDATE yawrd.sessions SET revoked_at=clock_timestamp() WHERE token_hash=ANY($1::text[])', [tokens.map(hash)]); }
    catch { console.error('Synthetic session revocation failed; no tokens logged.'); process.exitCode = 1; }
  }
}
