// Operator-run P3.8B SQL acceptance. No environment/credential loaders or migrations.
// One owner connection; fresh synthetic fixtures only; every write is rolled back.
// Positive SQL calls use synthetic verifier evidence, NOT a wallet/RPC authorization bypass.
// They certify only the installed post-verification SQL contract, never real wallet ownership.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { generatePublicId } from '../src/project-identity.ts';
import { generateDaoIdentifier } from '../src/creation/dao-identifier.ts';
import { createEmptyYawrdIntakeDraft, updateYawrdIntakeDraft } from '../src/yawrd-intake.ts';
import { prepareCreation } from '../src/creation-integration.ts';
import { testnetFactorySettings } from '../src/testnet-factory-settings.ts';
import { preparationArtifacts } from '../test/fixtures/preparation.ts';
import { validatePreparation, preparationIssues } from '../src/creation/preparation-contract.ts';
import { preparationText } from '../src/creation/preparation-repository.ts';
import { initialContributionConfiguration, validateContributionConfiguration } from '../src/creation/contribution-configuration.ts';
import { proposedYawrdPreview } from '../src/creation/yawrd-preview.ts';
import { LaunchPreparationRepository } from '../src/creation/launch-preparation-repository.ts';
import { ContributionConfigurationRepository } from '../src/creation/contribution-configuration-repository.ts';
import { PublicationRepository } from '../src/creation/publication-repository.ts';
import { publicGeneralizedYawrd } from '../src/creation/publication-public.ts';
import { publicationText, PUBLICATION_CONSENT } from '../src/creation/publication.ts';
import { serializeNep413, verifySignature } from '../src/identity/nep413.ts';

export const ENDPOINT = 'ep-twilight-voice-aorpfrbm';
const OWNER = 'neondb_owner', DATABASE = 'neondb';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MIGRATION = new URL('../docs/proposals/migrations/phase2_creation_publication.sql', import.meta.url);
export const MIGRATION_SHA256 = '0aaecec79a4783e41591687b28963269bb1faf192e5ed5f801f0260261d3b4bb';
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/\s+/g, ' ').trim();
class Stop extends Error { constructor(code) { super(code); this.code = code; } }
const need = (ok, code) => { if (!ok) throw new Stop(code); };
export const safeFailure = error => error instanceof Stop ? error.code : /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? 'postgres_' + error.code : 'verification_or_connection_failed';

export function publicationCheckTarget(hostname) {
  need(typeof hostname === 'string' && hostname.length < 254 &&
    hostname.startsWith(ENDPOINT + '.') && /^[a-z0-9.-]+\.neon\.tech$/.test(hostname) &&
    hostname.split('.').every(s => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)), 'confirmed_direct_development_hostname_required');
  return { hostname, endpoint: ENDPOINT, database: DATABASE, role: OWNER };
}
// Pass raw credential text directly; URI percent-decoding must never alter it.
export function ownerConnectionOptions(target, password) {
  publicationCheckTarget(target.hostname);
  need(target.role === OWNER && target.database === DATABASE && target.endpoint === ENDPOINT, 'owner_connection_target_mismatch');
  need(typeof password === 'string' && password.length > 0 && password.length <= 4096, 'password_required');
  return {host:target.hostname,port:5432,user:OWNER,database:DATABASE,password,ssl:{rejectUnauthorized:true},
    connectionTimeoutMillis:10000,query_timeout:8000,application_name:'yawrd-p38b-rollback-acceptance',
    options:'-c statement_timeout=5000 -c lock_timeout=1500 -c idle_in_transaction_session_timeout=20000'};
}
export function ownerFailure(error, stage) {
  return {status:'FAIL',stage,role:OWNER,code:safeFailure(error),credentials:'suppressed'};
}
export function publicationContract(source) {
  need(sha(source) === MIGRATION_SHA256, 'local_publication_artifact_changed');
  const functions = new Map([...source.matchAll(/CREATE FUNCTION yawrd_publication\.(\w+)\([\s\S]*? AS \$\$([\s\S]*?)\$\$;/g)].map(m => [m[1], normalize(m[2])]));
  need(functions.size === 5, 'publication_function_inventory_mismatch');
  return functions;
}
export function syntheticFixture() {
  const run = randomBytes(10).toString('hex'), id = generatePublicId(), identifier = generateDaoIdentifier();
  const founder = 'p38b-check-a-' + run + '.testnet', other = 'p38b-check-b-' + run + '.testnet';
  const now = new Date().toISOString();
  const intake = { ...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('p38b-' + run, now), {
    projectType: 'research', startingPoint: 'idea', availableResources: 'Synthetic fixtures only',
    successCriteria: 'Verify a rollback-only public projection.', initialOutcomeConfirmed: true,
    intendedBudget: 'no-money-needed', founderDescription: 'PRIVATE_INTAKE_' + run,
  }, now), projectName: 'Synthetic P3.8B rollback' };
  const artifacts = preparationArtifacts();
  artifacts.blueprint.title = 'Synthetic publication ' + run;
  artifacts.blueprint.summary = 'Synthetic overview with “quotes”, unicode 🌱 and a newline.\nRollback only.';
  artifacts.privateNotes = 'PRIVATE_NOTES_' + run;
  artifacts.skill.instructions = ['PRIVATE_SKILL_' + run];
  artifacts.tasks[0].title = 'PRIVATE_EXCLUDED_TASK_' + run;
  artifacts.tasks[2].dependencies = ['observe', 'review'];
  artifacts.tasks.forEach(t => t.acceptanceCriteria = [{ check: 'PRIVATE_CHECK_' + run, evidence: 'PRIVATE_EVIDENCE_' + run }]);
  artifacts.references.forEach(r => r.content = 'PRIVATE_REFERENCE_' + run);
  validatePreparation(artifacts); need(preparationIssues(artifacts).length === 0, 'invalid_synthetic_preparation');
  const source = { revision: 1, digest: sha(preparationText(artifacts)), title: artifacts.blueprint.title, tasks: artifacts.tasks, references: artifacts.references };
  const configuration = initialContributionConfiguration(source);
  configuration.participationTerms = 'PRIVATE_PARTICIPATION_' + run;
  configuration.tasks[0].included = false;
  configuration.tasks[1].rewardTerms = 'unpaid'; configuration.tasks[1].unpaidAcknowledged = true;
  configuration.tasks.forEach(t => t.rewardNote = 'PRIVATE_REWARD_NOTE_' + run);
  validateContributionConfiguration(configuration, source);
  const saved = { revision: 1, source, configuration, digest: sha(JSON.stringify(configuration)), savedBy: founder, savedAt: now };
  const expected = proposedYawrdPreview({ name: artifacts.blueprint.title, description: artifacts.blueprint.summary }, saved, 'none-planned');
  need(!JSON.stringify(expected).includes('PRIVATE_'), 'fixture_projection_leaks_private_fields');
  const sessions = [sha(randomBytes(32)), sha(randomBytes(32))], challenges = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
  const hash = () => randomBytes(24).toString('hex').replaceAll('0', '1').slice(0, 44); // Base58-compatible synthetic transaction/receipt labels.
  return { run, id, identifier, founder, other, intake, artifacts, configuration, source, expected, sessions, challenges,
    deploymentHash: hash(), paymentHash: hash(), receiptHash: hash() };
}

// Hidden terminal input only. No argv/env/password-file fallback and no echo.
export function requirePasswordTerminal(input, output) {
  need(input.isTTY && typeof input.setRawMode === 'function' && output.isTTY, 'interactive_terminal_required');
}
export async function passwordPrompt(input = process.stdin, output = process.stderr) {
  requirePasswordTerminal(input, output);
  output.write('Neon Development neondb_owner password (hidden): ');
  const wasRaw = input.isRaw; input.setRawMode(true); input.setEncoding('utf8'); input.resume();
  let password = '';
  try {
    return await new Promise((resolvePassword, reject) => {
      function done(error) { input.off('data', data); error ? reject(error) : resolvePassword(password); }
      function data(chunk) {
        for (const c of chunk) {
          if (c === '\r' || c === '\n') { done(password.length ? null : new Stop('password_required')); return; }
          if (c === '\u0003' || c === '\u0004') { done(new Stop('cancelled')); return; }
          if (c === '\u007f' || c === '\b') password = [...password].slice(0, -1).join('');
          else if (c < ' ' || c === '\u001b' || password.length >= 4096) { done(new Stop('invalid_password_input')); return; }
          else password += c;
        }
      }
      input.on('data', data);
    });
  } finally { password = ''; input.setRawMode(wasRaw); input.pause(); output.write('\n'); }
}

// Deliberately accept only this simple four-column SELECT, with optional table
// qualification and PostgreSQL whitespace/semicolon presentation differences.
export function assertPublicViewContract(view) {
  need(view?.kind === 'v' && view.owner === OWNER, 'public_view_identity_mismatch');
  const names = ['id','creator_account_id','payload','published_at'];
  need(Array.isArray(view.columns) && isDeepStrictEqual(view.columns.map(c=>c.name), names) &&
    view.columns.every(c=>c.typeMatches === true), 'public_view_column_mismatch');
  const dependencies = view.dependencies;
  need(Array.isArray(dependencies) && dependencies.length === 4 && dependencies.every(d=>d.allowed === true) &&
    isDeepStrictEqual(dependencies.map(d=>d.column).sort(), ['creation_id','founder','payload','published_at']), 'public_view_dependency_mismatch');
  const ref = column => '(?:publications\\s*\\.\\s*)?' + column;
  const pattern = '^\\s*select\\s+' + ref('creation_id') + '\\s+as\\s+id\\s*,\\s*' +
    ref('founder') + '\\s+as\\s+creator_account_id\\s*,\\s*' + ref('payload') + '\\s*,\\s*' +
    ref('published_at') + '\\s+from\\s+yawrd_publication\\s*\\.\\s*publications\\s*;?\\s*$';
  need(typeof view.definition === 'string' && new RegExp(pattern,'i').test(view.definition), 'installed_public_view_definition_mismatch');
}
export const PUBLIC_VIEW_CATALOG_SQL = `SELECT c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner,
  pg_get_viewdef(c.oid,true) AS definition,
  (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'typeMatches',
    a.atttypid=CASE a.attnum WHEN 1 THEN 'pg_catalog.text'::regtype WHEN 2 THEN 'pg_catalog.text'::regtype
      WHEN 3 THEN 'pg_catalog.jsonb'::regtype WHEN 4 THEN 'pg_catalog.timestamptz'::regtype END
    AND a.atttypmod=-1) ORDER BY a.attnum)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT jsonb_agg(DISTINCT jsonb_build_object('column',a.attname,'allowed',
    d.refclassid='pg_catalog.pg_class'::regclass AND d.refobjid='yawrd_publication.publications'::regclass
    AND a.attname=ANY(ARRAY['creation_id','founder','payload','published_at'])))
    FROM pg_rewrite r JOIN pg_depend d ON d.classid='pg_catalog.pg_rewrite'::regclass AND d.objid=r.oid
    LEFT JOIN pg_attribute a ON d.refclassid='pg_catalog.pg_class'::regclass AND a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
    WHERE r.ev_class=c.oid AND r.rulename='_RETURN'
      AND NOT(d.refclassid='pg_catalog.pg_class'::regclass AND d.refobjid=c.oid)) AS dependencies
  FROM pg_class c WHERE c.oid=to_regclass('yawrd_publication.public_yawrds')`;

export const FUNCTIONAL_CASES = ['projection_and_privacy','unresolved_funding_projection','unauthorized_and_failed_attempts',
  'stale_blueprint_even_with_same_public_text','stale_contributions_even_with_same_public_payload',
  'stale_governance_revision','receipt_idempotency_immutability_and_real_public_view'];
export function acceptanceProgress({fixtureWritesAttempted, fixturesCreated, fixtureSetupComplete, rollbackVerified, fixtureRowsAbsentVerified, checks, failed}) {
  const functionalChecksCompleted = checks.filter(c => FUNCTIONAL_CASES.includes(c.name)).map(c => c.name);
  const cleanupVerified = fixturesCreated && rollbackVerified && fixtureRowsAbsentVerified;
  const fixtureCreationState = !fixtureWritesAttempted ? 'not_started' : fixtureSetupComplete ? 'base_fixture_verified' : fixturesCreated ? 'partial_fixture_acknowledged' : 'first_write_unconfirmed_or_rejected';
  return {fixtureWritesAttempted, fixturesCreated, fixtureSetupComplete, fixtureCreationState, rollbackVerified, fixtureRowsAbsentVerified,
    cleanupVerified, syntheticFixturesRemoved:cleanupVerified, functionalChecksCompleted,
    functionalAcceptanceComplete:!failed && cleanupVerified && FUNCTIONAL_CASES.every(name=>functionalChecksCompleted.includes(name))};
}

export async function runPublicationAcceptance(client, target, source) {
  const functions = publicationContract(source), f = syntheticFixture(), checks = [], tickets = [];
  let begun = false, rollbackVerified = false, fixtureRowsAbsentVerified = false, fixtureWritesAttempted = false, fixturesCreated = false, fixtureSetupComplete = false, failure, stage = 'connected_identity', caseStarted = 0;
  const deadline = Date.now() + 90000;
  const q = async (sql, values = []) => {
    need(Date.now() < deadline && (!caseStarted || Date.now() - caseStarted < 15000), 'bounded_verification_deadline');
    return client.query(sql, values);
  };
  const one = async (sql, values = []) => { const r = await q(sql, values); need(r.rows.length === 1, 'expected_one_row'); return r.rows[0]; };
  const query = async (sql, values = []) => (await q(sql, values)).rows;
  const launch = new LaunchPreparationRepository(query);
  // No success-returning key-verifier test hook: the positive test invokes only SQL, never repo.publish().
  const publication = new PublicationRepository(query, async () => { throw new Stop('wallet_rpc_outside_sql_acceptance'); });
  async function reject(sql, values, code, message) {
    await q('SAVEPOINT p38b_reject'); let observed;
    try { await q(sql, values); } catch (error) { observed = error; }
    await client.query('ROLLBACK TO SAVEPOINT p38b_reject'); await client.query('RELEASE SAVEPOINT p38b_reject');
    if (!(observed?.code === code && (!message || observed.message === message))) {
      const error = new Stop('expected_sql_rejection_not_observed');
      error.expectedSqlstate = code;
      error.observedSqlstate = /^[0-9A-Z]{5}$/.test(observed?.code ?? '') ? observed.code : null;
      throw error;
    }
    return { sqlstate: observed.code, ...(message ? { reason: message } : {}) };
  }
  async function testCase(name, work) {
    stage = name; await q('SAVEPOINT p38b_case'); caseStarted = Date.now();
    let details;
    try { details = await work(); }
    finally { caseStarted = 0; await client.query('ROLLBACK TO SAVEPOINT p38b_case'); await client.query('RELEASE SAVEPOINT p38b_case'); }
    checks.push({ name, ...details }); // Complete only after this case's rollback/release succeeds.
  }
  const noPublication = async () => need((await one('SELECT count(*)::int AS n FROM yawrd_publication.public_yawrds WHERE id=$1', [f.id])).n === 0, 'failed_attempt_left_publication');
  const publishSql = 'SELECT yawrd_publication.publish($1,$2,$3,$4,$5::jsonb) AS receipt';
  const publishArgs = (c, evidence, session = f.sessions[0], account = f.founder) => [session, f.id, account, c.id, JSON.stringify(evidence)];
  async function issue() { const view = await launch.read(f.sessions[0], f.id); need(view.current, 'synthetic_source_not_current');
    const c = await publication.issue(f.sessions[0], f.id, f.founder, 'https://p38b-rollback.invalid', { source: view.source, proposed: view.proposed }); tickets.push(c.id); return c; }
  const pair = generateKeyPairSync('ed25519'), rawKey = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  let number = BigInt('0x' + rawKey.toString('hex')), encoded = '';
  while (number) { encoded = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(number % BigInt(58))] + encoded; number /= BigInt(58); }
  for (const b of rawKey) { if (b) break; encoded = '1' + encoded; }
  function evidence(c) {
    const proof = { accountId: f.founder, publicKey: 'ed25519:' + encoded,
      signature: sign(null, createHash('sha256').update(serializeNep413(c.message, Buffer.from(c.nonce, 'base64'), c.recipient)).digest(), pair.privateKey).toString('base64') };
    verifySignature(c, proof); // Real local cryptography; no claim of on-chain key ownership.
    return { proof, key: { blockHeight: 1, blockHash: f.receiptHash }, consentVersion: PUBLICATION_CONSENT, verificationScope: 'SYNTHETIC_SQL_CONTRACT_ONLY' };
  }
  const counts = async () => (await one(`SELECT
    (SELECT count(*)::int FROM yawrd.auth_challenges WHERE id=ANY($2::text[])) AS challenges,
    (SELECT count(*)::int FROM yawrd.sessions WHERE token_hash=ANY($3::text[])) AS sessions,
    (SELECT count(*)::int FROM yawrd.creation_drafts WHERE id=$1) AS creations,
    (SELECT count(*)::int FROM yawrd.creation_deployments WHERE creation_id=$1) AS deployments,
    (SELECT count(*)::int FROM yawrd.creation_platform_fees WHERE creation_id=$1) AS fees,
    (SELECT count(*)::int FROM yawrd.creation_preparation_versions WHERE creation_id=$1) AS versions,
    (SELECT count(*)::int FROM yawrd.creation_preparation_approvals WHERE creation_id=$1) AS approvals,
    (SELECT count(*)::int FROM yawrd.creation_contribution_configurations WHERE creation_id=$1) AS contributions,
    (SELECT count(*)::int FROM yawrd.creation_governance_configurations WHERE creation_id=$1) AS governance,
    (SELECT count(*)::int FROM yawrd_publication.tickets WHERE creation_id=$1 OR id=ANY($4::text[])) AS tickets,
    (SELECT count(*)::int FROM yawrd_publication.publications WHERE creation_id=$1) AS publications,
    (SELECT count(*)::int FROM yawrd_publication.public_yawrds WHERE id=$1) AS discoverable,
    (SELECT count(*)::int FROM yawrd.projects WHERE id=$1) AS participant_projects
    `, [f.id, f.challenges, f.sessions, tickets]));
  try {
    const identity = await one('SELECT current_user AS role,session_user AS login,current_database() AS database,pg_backend_pid() AS pid');
    need(target.endpoint === ENDPOINT && target.role === OWNER && target.database === DATABASE && identity.role === OWNER && identity.login === OWNER && identity.database === DATABASE, 'connected_identity_mismatch');
    checks.push({ name: stage, database: DATABASE, endpoint: ENDPOINT, login: OWNER, hostnameTlsPinned: true });
    // All writes, including fixture APIs and negative probes, occur after this BEGIN.
    await q('BEGIN ISOLATION LEVEL READ COMMITTED'); begun = true;
    await q("SET LOCAL search_path=pg_catalog,pg_temp");
    await q("SET LOCAL statement_timeout='5s'"); await q("SET LOCAL lock_timeout='1500ms'"); await q("SET LOCAL idle_in_transaction_session_timeout='20s'");
    stage = 'installed_contract';
    const installed = (await q(`SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='yawrd_publication'`)).rows;
    need(installed.length === 5 && installed.every(p => functions.get(p.proname) === normalize(p.prosrc) && p.prosecdef && p.owner === OWNER &&
      p.proconfig?.some(s => s.replaceAll(' ', '') === 'search_path=pg_catalog,pg_temp')), 'installed_publication_contract_mismatch');
    const view = await one(PUBLIC_VIEW_CATALOG_SQL);
    assertPublicViewContract(view);
    checks.push({ name: stage, functionBodiesMatch: 5, publicViewDefinitionMatches: true,
      publicColumns:view.columns.map(c=>c.name), publicColumnTypesMatch:true, publicDependenciesMatch:true, acceptedPermissionsNotRepeated: true });
    need(Object.values(await counts()).every(n => n === 0), 'synthetic_collision');
    stage = 'synthetic_fixture_setup';
    for (let i = 0; i < 2; i++) {
      fixtureWritesAttempted = true;
      await q(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
        VALUES($1,$2,$3,'testnet','https://p38b-rollback.invalid','SYNTHETIC SQL-only fixture','P3.8B rollback acceptance',$4,
        statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`, [f.challenges[i], sha(randomBytes(32)), i ? f.other : f.founder, randomBytes(32).toString('base64')]);
      fixturesCreated = true; // First fixture INSERT was acknowledged, even if later setup fails.
      await q(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at)
        VALUES($1,$2,'testnet',$3,'SYNTHETIC SQL-only key',1,'synthetic-block',statement_timestamp(),statement_timestamp()+interval '1 hour')`, [f.sessions[i], f.challenges[i], i ? f.other : f.founder]);
    }
    let c = await one('SELECT * FROM yawrd.creation_start($1,$2,$3::jsonb)', [f.sessions[0], f.id, JSON.stringify(f.intake)]);
    c = await one('SELECT * FROM yawrd.creation_save($1,$2,$3,NULL,$4::jsonb)', [f.sessions[0], f.id, c.revision, JSON.stringify({ publicName: 'Synthetic historical name', publicDescription: 'Synthetic historical description', accountLabel: '', secondSteward: f.other, threshold: 2 })]);
    const prepared = prepareCreation({ projectName: c.public_name, projectPurpose: c.public_description, projectAccountLabel: f.identifier, creatorAccountId: f.founder,
      initialStewardAccountIds: [f.other], stewardApprovalThreshold: 2, factoryAccountId: testnetFactorySettings.factoryAccountId }, testnetFactorySettings, { accountId: f.founder, network: 'testnet' });
    let d = await one('SELECT * FROM yawrd.creation_deployment_reserve($1,$2,$3,$4)', [f.sessions[0], f.id, c.revision, f.identifier]);
    d = await one('SELECT * FROM yawrd.creation_deployment_prepare($1,$2,$3,$4,$5::jsonb,$6::jsonb)', [f.sessions[0], f.id, c.revision, d.revision, JSON.stringify(prepared), JSON.stringify({ syntheticRollbackOnly: true })]);
    d = await one('SELECT * FROM yawrd.creation_deployment_claim($1,$2,$3,$4,$5,$6)', [f.sessions[0], f.id, c.revision, d.revision, 1, 'creation-deployment-v1']);
    d = await one('SELECT * FROM yawrd.creation_deployment_note($1,$2,$3,$4,$5)', [f.sessions[0], f.id, d.revision, 1, f.deploymentHash]);
    d = await one('SELECT * FROM yawrd.creation_deployment_finish($1,$2,$3,$4,$5,$6::jsonb)', [f.sessions[0], f.id, d.revision, 1, 'deployed-hardening-required', JSON.stringify({ transactionHash: f.deploymentHash, evidenceDigest: sha('SYNTHETIC deployment ' + f.id), transactionBlockHeight: '2', finalHeight: '3', autoUpdate: true })]);
    const review = { verified: true, autoUpdate: false, proposalId: 0, proposalStatus: 'Approved', votes: { [f.founder]: 'Approve', [f.other]: 'Approve' }, blockHeight: 10, blockHash: f.receiptHash, checkedAt: new Date().toISOString() };
    let fee = await one('SELECT * FROM yawrd.creation_fee_open($1,$2,$3,$4,$5::jsonb)', [f.sessions[0], f.id, c.revision, d.revision, JSON.stringify(review)]);
    fee = await one('SELECT * FROM yawrd.creation_fee_claim($1,$2,$3,$4,$5,$6::jsonb,$7)', [f.sessions[0], f.id, c.revision, d.revision, fee.revision, JSON.stringify(review), 'creation-platform-fee-v1']);
    fee = await one('SELECT * FROM yawrd.creation_fee_note($1,$2,$3,$4)', [f.sessions[0], f.id, fee.revision, f.paymentHash]);
    await one('SELECT * FROM yawrd.creation_fee_complete($1,$2,$3,$4::jsonb)', [f.sessions[0], f.id, fee.revision, JSON.stringify({ txHash: f.paymentHash, blockHeight: '11', receiptId: f.receiptHash, evidenceDigest: sha('SYNTHETIC payment ' + f.id) })]);
    // Existing owner fixture insertion, with all installed guards enabled. No generation/provider call.
    await q(`INSERT INTO yawrd.creation_preparation_versions(creation_id,revision,origin,generation,artifact_text)
      VALUES($1,1,'ai-generated',$2::jsonb,$3)`, [f.id, JSON.stringify({ provider: 'near-ai-cloud', model: 'synthetic-fixture-only', promptVersion: 'synthetic-no-inference', responseId: f.run, sourceDigest: sha(f.run) }), preparationText(f.artifacts)]);
    await q('SELECT yawrd.creation_preparation_approve($1,$2,1,$3,$4)', [f.sessions[0], f.id, f.source.digest, 'creation-preparation-review-v1']);
    await q('SELECT yawrd.creation_contribution_save($1,$2,0,1,$3,true,$4)', [f.sessions[0], f.id, f.source.digest, JSON.stringify(f.configuration)]);
    await q('SELECT yawrd.creation_governance_save($1,$2,0,1,$3,1,$4,true)', [f.sessions[0], f.id, sha(JSON.stringify(f.configuration)), f.source.digest]);
    const base = await launch.read(f.sessions[0], f.id);
    need(base.current && isDeepStrictEqual(base.proposed, f.expected), 'typescript_fixture_projection_mismatch');
    fixtureSetupComplete = true;
    checks.push({ name: stage, creations: 1, sessions: 2, existingRecordsUsed: 0, syntheticVerifierEvidenceOnly: true });

    await testCase('projection_and_privacy', async () => {
      const ctx = (await one('SELECT yawrd_publication.context($1,$2,$3) AS v', [f.sessions[0], f.id, f.founder])).v;
      need(isDeepStrictEqual(ctx.source, base.source) && isDeepStrictEqual(ctx.payload, f.expected), 'sql_typescript_projection_mismatch');
      need(!JSON.stringify(ctx.payload).includes('PRIVATE_'), 'private_content_in_sql_projection');
      return { exactPayloadMatch: true, selectedTasks: ctx.payload.tasks.length, excludedDependencyLabel: true, orderedMixedDependencies: true, privateSentinelsExcluded: true };
    });
    await testCase('unresolved_funding_projection', async () => {
      const intake = updateYawrdIntakeDraft(f.intake, { intendedBudget: 'undecided' }, new Date().toISOString());
      await q('SELECT * FROM yawrd.creation_save($1,$2,$3,$4::jsonb,NULL)', [f.sessions[0], f.id, c.revision, JSON.stringify(intake)]);
      const view = await launch.read(f.sessions[0], f.id), ctx = (await one('SELECT yawrd_publication.context($1,$2,$3) AS v', [f.sessions[0], f.id, f.founder])).v;
      need(isDeepStrictEqual(ctx.payload, view.proposed) && ctx.payload.fundingPlan === 'unresolved' && ctx.payload.tasks.every(t => t.allocation === 'not-set'), 'unresolved_projection_mismatch');
      return { exactPayloadMatch: true, rewardAllocationsRemainUnset: true };
    });
    await testCase('unauthorized_and_failed_attempts', async () => {
      const ticket = await issue(), e = evidence(ticket), denials = [];
      denials.push(await reject(publishSql, publishArgs(ticket, e, f.sessions[1], f.other), 'P0001', 'creation_not_found')); await noPublication();
      denials.push(await reject(publishSql, publishArgs(ticket, e, '0'.repeat(64)), 'P0001', 'sign_in_required')); await noPublication();
      denials.push(await reject(publishSql, [f.sessions[0], f.id, f.founder, randomBytes(32).toString('base64url'), JSON.stringify(e)], 'P0001', 'launch_challenge_required')); await noPublication();
      denials.push(await reject(publishSql, publishArgs(ticket, { ...e, consentVersion: 'unapproved' }), 'P0001', 'launch_challenge_required')); await noPublication();
      denials.push(await reject(publishSql, publishArgs(ticket, { ...e, proof: { ...e.proof, accountId: f.other } }), 'P0001', 'launch_challenge_required')); await noPublication();
      await q('UPDATE yawrd.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [f.sessions[0]]);
      denials.push(await reject(publishSql, publishArgs(ticket, e), 'P0001', 'sign_in_required')); await noPublication();
      return { denials, publicRowsAfterEachFailure: 0 };
    });
    await testCase('stale_blueprint_even_with_same_public_text', async () => {
      const ticket = await issue(), updated = structuredClone(f.artifacts); updated.privateNotes += ' changed';
      await q('SELECT yawrd.creation_preparation_save($1,$2,1,$3,$4)', [f.sessions[0], f.id, f.source.digest, preparationText(updated)]);
      const digest = sha(preparationText(updated));
      await q('SELECT yawrd.creation_preparation_approve($1,$2,2,$3,$4)', [f.sessions[0], f.id, digest, 'creation-preparation-review-v1']);
      const unreviewed = await reject(publishSql, publishArgs(ticket, evidence(ticket)), 'P0001', 'launch_source_changed');
      await q('SELECT yawrd.creation_contribution_save($1,$2,1,2,$3,true,$4)', [f.sessions[0], f.id, digest, JSON.stringify(f.configuration)]);
      await q('SELECT yawrd.creation_governance_save($1,$2,1,2,$3,2,$4,true)', [f.sessions[0], f.id, sha(JSON.stringify(f.configuration)), digest]);
      need(isDeepStrictEqual((await launch.read(f.sessions[0], f.id)).proposed, base.proposed), 'blueprint_test_changed_public_payload');
      const rebound = await reject(publishSql, publishArgs(ticket, evidence(ticket)), 'P0001', 'launch_source_changed'); await noPublication();
      return { unreviewed, reviewedNewSource: rebound, identicalPublicPayload: true, publicRows: 0 };
    });
    await testCase('stale_contributions_even_with_same_public_payload', async () => {
      const ticket = await issue(), configuration = structuredClone(f.configuration); configuration.participationTerms += ' changed';
      await q('SELECT yawrd.creation_contribution_save($1,$2,1,1,$3,true,$4)', [f.sessions[0], f.id, f.source.digest, JSON.stringify(configuration)]);
      await q('SELECT yawrd.creation_governance_save($1,$2,1,2,$3,1,$4,true)', [f.sessions[0], f.id, sha(JSON.stringify(configuration)), f.source.digest]);
      need(isDeepStrictEqual((await launch.read(f.sessions[0], f.id)).proposed, base.proposed), 'contribution_test_changed_public_payload');
      const denial = await reject(publishSql, publishArgs(ticket, evidence(ticket)), 'P0001', 'launch_source_changed'); await noPublication(); return { denial, identicalPublicPayload: true, publicRows: 0 };
    });
    await testCase('stale_governance_revision', async () => {
      const ticket = await issue();
      // Append a valid next confirmation only for our synthetic Creation. The real save API
      // intentionally treats identical confirmations as retries, so a direct append tests the SQL threat.
      await q(`INSERT INTO yawrd.creation_governance_configurations(creation_id,revision,contribution_revision,contribution_digest,
        preparation_revision,preparation_digest,binding,review_mode,consent_version,saved_by)
        SELECT creation_id,2,contribution_revision,contribution_digest,preparation_revision,preparation_digest,binding,review_mode,consent_version,saved_by
        FROM yawrd.creation_governance_configurations WHERE creation_id=$1 AND revision=1`, [f.id]);
      const current = await launch.read(f.sessions[0], f.id); need(current.source.governanceRevision === 2 && current.current, 'governance_fixture_not_current');
      const denial = await reject(publishSql, publishArgs(ticket, evidence(ticket)), 'P0001', 'launch_source_changed'); await noPublication(); return { denial, publicRows: 0 };
    });
    await testCase('receipt_idempotency_immutability_and_real_public_view', async () => {
      const ticket = await issue(), otherTicket = await issue(), e = evidence(ticket);
      const first = (await one(publishSql, publishArgs(ticket, e))).receipt;
      const retry = (await one(publishSql, publishArgs(ticket, e))).receipt;
      need(first?.creationId === f.id && first.url === '/yawrd/' + f.id && isDeepStrictEqual(first, retry) && isDeepStrictEqual(first, await publication.receipt(f.sessions[0], f.id, f.founder)), 'publication_receipt_not_idempotent');
      const differentTicket = await reject(publishSql, publishArgs(otherTicket, evidence(otherTicket)), 'P0001', 'launch_already_published');
      const denials = [];
      for (const table of ['publications', 'tickets']) {
        const column = table === 'publications' ? 'payload' : 'source_text';
        denials.push(await reject(`UPDATE yawrd_publication.${table} SET ${column}=${column} WHERE creation_id=$1`, [f.id], '23514', 'immutable_record'));
        denials.push(await reject(`DELETE FROM yawrd_publication.${table} WHERE creation_id=$1`, [f.id], '23514', 'immutable_record'));
      }
      const duplicate = await reject(`INSERT INTO yawrd_publication.publications(creation_id,ticket_id,founder,payload,evidence)
        SELECT creation_id,ticket_id,founder,payload,evidence FROM yawrd_publication.publications WHERE creation_id=$1`, [f.id], '23505');
      const row = await one('SELECT * FROM yawrd_publication.public_yawrds WHERE id=$1', [f.id]);
      need(isDeepStrictEqual(Object.keys(row).sort(), ['creator_account_id','id','payload','published_at']) && row.creator_account_id === f.founder && isDeepStrictEqual(row.payload, f.expected) && !JSON.stringify(row).includes('PRIVATE_'), 'real_public_view_leaks_or_differs');
      const publicProject = await publicGeneralizedYawrd(query, f.id);
      need(isDeepStrictEqual(publicProject?.payload, f.expected), 'public_adapter_projection_mismatch');
      const n = await counts(); need(n.publications === 1 && n.discoverable === 1 && n.participant_projects === 0, 'publication_cardinality_or_participation_mismatch');
      need(isDeepStrictEqual(first, await publication.receipt(f.sessions[0], f.id, f.founder)), 'immutability_probe_changed_receipt');
      return { sameReceipt: true, publicationRows: 1, publicPayloadMatch: true, applicationsActivated: false, differentTicket, immutabilityDenials: denials, duplicate, concurrency: 'NOT_TESTED' };
    });
    await noPublication(); // The publication case itself has already rolled back.
    stage = 'before_outer_rollback'; const live = await counts(); need(live.creations === 1 && live.versions === 1 && live.sessions === 2 && live.publications === 0 && live.tickets === 0, 'case_rollback_not_complete');
  } catch (error) { failure = { stage, code: safeFailure(error), ...(error instanceof Stop && error.expectedSqlstate ? {expectedSqlstate:error.expectedSqlstate,observedSqlstate:error.observedSqlstate} : {}) }; }
  finally {
    if (begun) {
      try { need((await client.query('ROLLBACK')).command === 'ROLLBACK', 'rollback_not_acknowledged'); rollbackVerified = true; }
      catch { failure ??= { stage: 'rollback', code: 'rollback_not_acknowledged' }; }
    }
    if (rollbackVerified) {
      try { caseStarted = 0; const rows = await client.query(`SELECT
        (SELECT count(*) FROM yawrd.creation_drafts WHERE id=$1) +
        (SELECT count(*) FROM yawrd.creation_deployments WHERE creation_id=$1) +
        (SELECT count(*) FROM yawrd.creation_platform_fees WHERE creation_id=$1) +
        (SELECT count(*) FROM yawrd.creation_preparation_versions WHERE creation_id=$1) +
        (SELECT count(*) FROM yawrd.creation_preparation_approvals WHERE creation_id=$1) +
        (SELECT count(*) FROM yawrd.creation_contribution_configurations WHERE creation_id=$1) +
        (SELECT count(*) FROM yawrd.creation_governance_configurations WHERE creation_id=$1) +
        (SELECT count(*) FROM yawrd_publication.tickets WHERE creation_id=$1 OR id=ANY($4::text[])) +
        (SELECT count(*) FROM yawrd_publication.publications WHERE creation_id=$1) +
        (SELECT count(*) FROM yawrd_publication.public_yawrds WHERE id=$1) +
        (SELECT count(*) FROM yawrd.sessions WHERE token_hash=ANY($2::text[])) +
        (SELECT count(*) FROM yawrd.auth_challenges WHERE id=ANY($3::text[])) AS remaining`, [f.id, f.sessions, f.challenges, tickets]);
        need(String(rows.rows[0]?.remaining) === '0', 'synthetic_rows_remain'); fixtureRowsAbsentVerified = true;
      } catch { failure ??= { stage: 'cleanup_evidence', code: 'postrollback_cleanup_not_verified' }; }
    }
  }
  return { status: failure ? 'FAIL' : 'PASS_SQL_ONLY', ...(failure ?? {}), role: OWNER, migrationSha256: MIGRATION_SHA256,
    ...acceptanceProgress({fixtureWritesAttempted,fixturesCreated,fixtureSetupComplete,rollbackVerified,fixtureRowsAbsentVerified,checks,failed:!!failure}),
    ...(!failure ? {stage:'complete'} : {}), checks, concurrency: 'BLOCKED_REQUIRES_ISOLATED_COMMITTED_FIXTURE',
    realWalletAndWriterIntegration: 'NOT_TESTED', realFounderLaunchReady: false, credentials: 'suppressed' };
}

async function main() {
  let client, password = '', stage = 'arguments';
  try {
    const args = process.argv.slice(2);
    if (args.join(' ') === '--plan') {
      publicationContract(await readFile(MIGRATION, 'utf8')); const f = syntheticFixture();
      console.log(JSON.stringify({ status: 'OFFLINE_PLAN_ONLY', endpoint: ENDPOINT, database: DATABASE, role: OWNER,
        migrationSha256: MIGRATION_SHA256, selectedTasks: f.expected.tasks.length, databaseExecuted: false, writes: 'rollback-only synthetic fixture setup, guarded source changes, tickets/publications and rejected mutation probes', concurrency: 'BLOCKED' })); return;
    }
    need(args.length === 3 && args[0] === '--development-rollback' && args[1] === '--hostname', 'use_plan_or_explicit_development_rollback');
    need(resolve(process.cwd()) === resolve(ROOT), 'worktree_mismatch');
    const target = publicationCheckTarget(args[2]), source = await readFile(MIGRATION, 'utf8'); publicationContract(source);
    need(typeof WebSocket === 'function', 'native_websocket_required');
    stage = 'owner_password_prompt'; password = await passwordPrompt();
    const { Client } = await import('@neondatabase/serverless');
    client = new Client(ownerConnectionOptions(target, password));
    password = ''; client.on('error', () => {}); stage = 'owner_connect';
    await client.connect(); const result = await runPublicationAcceptance(client, target, source);
    console.log(JSON.stringify(result)); if (result.status !== 'PASS_SQL_ONLY') process.exitCode = 1;
  } catch (error) { console.log(JSON.stringify(ownerFailure(error, stage))); process.exitCode = 1; }
  finally { password = ''; if (client) { try { await client.end(); } catch { process.exitCode = 1; } } }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
