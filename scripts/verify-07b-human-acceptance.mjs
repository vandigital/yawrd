// Read-only corroboration of the owner-operated two-wallet acceptance exercise.
// Never mint, recover or expose a browser cookie, token, proof or session hash.
import './load-environment.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { developmentDatabaseUrl } from '../src/participants/database-config.ts';
import { ParticipantRepository } from '../src/participants/repository.ts';

const origin = 'http://localhost:3000';
const applicant = 'olddadai.testnet';
const creator = 'yawrd1.testnet';
const ids = ['dev-yaw-001', 'dev-yaw-001-rejection'];
let stage = 'confirmed development target';
try {
  assert.equal(process.env.YAWRD_DEV_DATABASE_ENDPOINT, 'ep-twilight-voice-aorpfrbm');
  assert.equal(process.env.YAWRD_APP_ORIGIN, origin);
  const sql = neon(developmentDatabaseUrl());
  const query = async (text, values = []) => (await sql.transaction([sql.query(text, values)], { readOnly: true }))[0];
  const [target] = await query("SELECT current_database()='neondb' AS expected, current_user='yawrd_07b_runtime' AS runtime");
  assert.ok(target.expected && target.runtime);
  stage = 'persisted human decisions';
  const decisions = await query(`SELECT p.id AS project_id,p.creator_account_id,a.account_id,d.decision,d.reviewer_account_id,a.consent_version
    FROM yawrd.projects p JOIN yawrd.applications a ON a.network=p.network AND a.project_id=p.id
    JOIN yawrd.review_decisions d ON d.application_id=a.id
    WHERE p.network='testnet' AND p.id=ANY($1::text[]) AND a.account_id=$2 ORDER BY p.id`, [ids, applicant]);
  assert.equal(decisions.length, 2);
  for (const row of decisions) {
    assert.equal(row.creator_account_id, creator);
    assert.equal(row.account_id, applicant);
    assert.equal(row.reviewer_account_id, creator);
    assert.equal(row.consent_version, 'participant-v1');
    assert.equal(row.decision, row.project_id === ids[0] ? 'approved' : 'rejected');
  }
  stage = 'stored authentication evidence';
  const authEvidence = await query(`SELECT s.account_id,count(*)::int AS verified_sessions,
    count(*) FILTER (WHERE s.revoked_at IS NOT NULL)::int AS revoked_sessions,
    count(*) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at>clock_timestamp())::int AS active_sessions
    FROM yawrd.sessions s JOIN yawrd.auth_challenges c ON c.id=s.challenge_id
    WHERE s.network='testnet' AND s.account_id=ANY($1::text[]) AND c.origin=$2
      AND c.recipient='Yawrd participant sign-in' AND c.consumed_at IS NOT NULL
      AND s.public_key LIKE 'ed25519:%' AND s.block_height>0
    GROUP BY s.account_id ORDER BY s.account_id`, [[creator, applicant], origin]);
  assert.equal(authEvidence.length, 2);
  const applicantEvidence = authEvidence.find(row => row.account_id === applicant);
  assert.ok(applicantEvidence.verified_sessions >= 2 && applicantEvidence.revoked_sessions >= 1);
  assert.ok(applicantEvidence.active_sessions > 0, 'An existing unexpired human applicant session is required for the rejected-session check');

  // Use the exact production repository SELECT. Resolve its $2 session-hash
  // parameter inside PostgreSQL from an EXISTING live human session. No hash
  // leaves PostgreSQL, and no browser login or HTTP identity is fabricated.
  const authenticatedQuery = async (text, values = []) => {
    assert.equal(values[1], 'existing-human-session');
    const lookup = `(SELECT token_hash FROM yawrd.sessions WHERE network='testnet' AND account_id=$2
      AND revoked_at IS NULL AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT 1)`;
    return query(text.replace(/\$2\b/g, lookup), [values[0], applicant]);
  };
  const authenticated = new ParticipantRepository(authenticatedQuery);
  const anonymous = new ParticipantRepository(query);
  const checks = [];
  for (const id of ids) {
    stage = `repository authorization ${id}`;
    const publicView = await anonymous.view(id, null);
    assert.equal(publicView.accountId, null);
    assert.equal(publicView.restrictedContent, null);
    assert.equal(publicView.application, null);
    assert.deepEqual(publicView.applications, []);
    const view = await authenticated.view(id, 'existing-human-session');
    assert.equal(view.accountId, applicant);
    assert.equal(view.application.status, id === ids[0] ? 'approved' : 'rejected');
    assert.equal(view.application.reviewerAccountId, creator);
    assert.deepEqual(view.applications, []);
    if (id === ids[0]) {
      assert.equal(view.role, 'participant');
      assert.ok(view.restrictedContent);
    } else {
      assert.equal(view.role, 'public');
      assert.equal(view.restrictedContent, null);
    }
    stage = `anonymous HTTP/API/SSR denial ${id}`;
    const api = await fetch(`${origin}/api/yawrd/${id}/state`, { signal: AbortSignal.timeout(15000) });
    assert.equal(api.status, 200);
    assert.match(api.headers.get('cache-control'), /private.*no-store/);
    assert.ok(api.headers.get('vary')?.toLowerCase().split(',').map(v => v.trim()).includes('cookie'));
    const state = await api.json();
    assert.equal(state.accountId, null);
    assert.equal(state.restrictedContent, null);
    assert.deepEqual(state.applications, []);
    assert.equal(state.application, null);
    const page = await fetch(`${origin}/yawrd/${id}`, { signal: AbortSignal.timeout(15000) });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes('YAW-001') && html.includes('DEVELOPMENT ONLY'));
    assert.equal(html.includes('Participant information'), false);
    assert.equal(html.includes('This synthetic text confirms approved access'), false);
    checks.push({ project: id, applicantDecision: view.application.status, authenticatedRestrictedAccess: view.restrictedContent !== null,
      otherApplicationsHidden: true, anonymousRepositoryDenied: true, anonymousApiStatus: api.status,
      anonymousApiRestrictedContent: null, anonymousSsrStatus: page.status, anonymousSsrRestrictedContentAbsent: true });
  }
  const evidence = { status: 'passed', recordedAt: new Date().toISOString(), origin, creator, applicant,
    databaseReadOnly: true, sessionResolution: 'Existing active human session resolved inside PostgreSQL; no token or hash exported; not a browser-cookie replay',
    humanSigningSource: 'Owner-reported Meteor NEP-413 exercise, corroborated by stored sessions and finalized key evidence',
    decisions, authEvidence, checks };
  const directory = new URL('../docs/verification/milestone-07b/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('human-acceptance-server-results.json', directory), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} catch {
  console.error(`Human acceptance verification failed at ${stage}; private data and connection details suppressed.`);
  process.exitCode = 1;
}
