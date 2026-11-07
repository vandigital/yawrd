import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Query } from '../participants/database.ts';
import { hashToken, opaqueToken, storedChallenge } from '../participants/auth.ts';
import { requireIdentity, testnetAccessKeyVerifier, type VerifyAccessKey } from '../identity/nep413.ts';
import type { IdentityChallenge, IdentityProof } from '../identity/types.ts';
import { fail } from '../participants/repository.ts';
import { ACK_CONSENT, REQUEST_CONSENT, SUBMISSION_RECIPIENT, type ContributionState, type RequestInput, type TaskRef } from './types.ts';
import { CONTRIBUTION_TASKS, TASK_B_PARTICIPANT, TASK_B_RECIPIENT, contributionActivation, contributionsActive, type ContributionActivation } from './policy.ts';
import { checkTaskBSignatureDesign, taskBSigningDesign } from './submission-signature.ts';
import { contributionDescriptionError } from './validation.ts';

const liveSession = `s.token_hash = $1 AND s.network = 'testnet' AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()`;
const project = `p.network = 'testnet' AND p.id = 'yaw-001' AND p.published_at IS NOT NULL
  AND p.creator_account_id = 'yawrd1.testnet' AND p.dao_account_id = 'demo.factory.yawrd.testnet'`;
const membership = `a.network = p.network AND a.project_id = p.id AND a.account_id = s.account_id`;
const approved = `d.application_id = a.id AND d.network = a.network AND d.project_id = a.project_id AND d.decision = 'approved'`;
const bounded = (value: unknown, max: number): value is string => typeof value === 'string'
  && [...value].length > 0 && [...value].length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
function task(ref: unknown, pr: unknown) {
  fail(ref === 'task-a' || ref === 'task-b', 'invalid_task');
  const definition = CONTRIBUTION_TASKS[ref];
  fail(pr === definition.prUrl, 'invalid_evidence');
  return { ref, ...definition } as const;
}
const instant = (value: unknown) => new Date(value as string | Date).toISOString();
function keys(input: Record<string, unknown>, expected: string[]) {
  fail(Object.keys(input).length === expected.length && expected.every(key => Object.hasOwn(input, key)), 'invalid_request');
}
const dateOnly = (value: unknown) => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
// Keep contribution challenges out of the login browser-cookie namespace. A new
// sign-in/session cannot reuse an earlier session's contribution challenge.
const signingSessionHash = (hash: string) => hashToken(`${SUBMISSION_RECIPIENT}\n${hash}`);

export class ContributionRepository {
  readonly query: Query;
  readonly activation: ContributionActivation;
  readonly verifyKey: VerifyAccessKey;
  readonly clock: () => number;
  constructor(query: Query, activation: ContributionActivation = contributionActivation(), verifyKey: VerifyAccessKey = testnetAccessKeyVerifier(), clock = Date.now) {
    this.query = query; this.activation = activation; this.verifyKey = verifyKey; this.clock = clock;
  }
  private gate(id: string, hash: string | null) {
    fail(id === 'yaw-001', 'not_found', 404);
    fail(hash && /^[a-f0-9]{64}$/.test(hash), 'sign_in_required', 401);
    fail(contributionsActive(this.activation), 'contributions_inactive', 503);
  }
  private async actor(hash: string) {
    const [row] = await this.query(`SELECT s.account_id, a.id AS application_id, d.decision
      FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      LEFT JOIN yawrd.applications a ON ${membership}
      LEFT JOIN yawrd.review_decisions d ON ${approved}
      WHERE ${project}`, [hash]);
    fail(row, 'sign_in_required', 401);
    fail(row.account_id === 'yawrd1.testnet' || (row.application_id && row.decision === 'approved'), 'approved_participant_required', 403);
    return row;
  }
  async state(id: string, hash: string | null): Promise<ContributionState> {
    this.gate(id, hash);
    const actor = await this.actor(hash!);
    const creator = actor.account_id === 'yawrd1.testnet';
    const refs = (Object.keys(CONTRIBUTION_TASKS) as TaskRef[]).filter(ref => creator ||
      (this.activation.owners[ref] === actor.account_id && (ref !== 'task-b' || actor.account_id === TASK_B_PARTICIPANT)));
    const rows = refs.length ? await this.query(`SELECT e.task_ref, e.event_kind, e.actor_account_id, e.description,
      e.recipient_account_id, e.recorded_at, e.historical_accepted_on, e.historical_accepted_at, e.historical_acceptance_evidence
      FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      LEFT JOIN yawrd.applications a ON ${membership}
      LEFT JOIN yawrd.review_decisions d ON ${approved}
      JOIN yawrd.yaw001_contribution_events e ON e.network = p.network AND e.project_id = p.id
      JOIN (VALUES ('task-a', $2::text), ('task-b', $3::text)) assignment(task_ref, owner_account_id)
        ON assignment.task_ref = e.task_ref
      WHERE ${project} AND (s.account_id = p.creator_account_id OR
        (d.decision = 'approved' AND assignment.owner_account_id = s.account_id
          AND (e.event_kind = 'acknowledgement' OR e.actor_account_id = s.account_id)))
      ORDER BY e.task_ref, e.event_kind`, [hash, this.activation.owners['task-a'], this.activation.owners['task-b'] === TASK_B_PARTICIPANT ? TASK_B_PARTICIPANT : null]) : [];
    return { accountId: String(actor.account_id), role: creator ? 'creator' : 'participant', tasks: refs.map(ref => {
      const definition = CONTRIBUTION_TASKS[ref];
      const request = rows.find(r => r.task_ref === ref && r.event_kind === 'request');
      const ack = rows.find(r => r.task_ref === ref && r.event_kind === 'acknowledgement');
      return { ref, title: definition.title, prUrl: definition.prUrl, historicalNote: definition.historicalNote,
        recipientAccountId: ref === 'task-b' ? TASK_B_RECIPIENT : this.activation.owners[ref],
        request: request ? { actorAccountId: String(request.actor_account_id), recipientAccountId: String(request.recipient_account_id), description: String(request.description), recordedAt: instant(request.recorded_at) } : null,
        acknowledgement: ack ? { actorAccountId: String(ack.actor_account_id), recordedAt: instant(ack.recorded_at), historicalAcceptedOn: dateOnly(ack.historical_accepted_on), historicalAcceptedAt: ack.historical_accepted_at == null ? null : instant(ack.historical_accepted_at), evidence: String(ack.historical_acceptance_evidence) } : null };
    }) };
  }
  private async requestActor(id: string, hash: string | null, input: Record<string, unknown>) {
    this.gate(id, hash);
    keys(input, ['kind', 'taskRef', 'prUrl', 'description', 'recipientAccountId', 'consent', 'consentVersion']);
    fail(input.kind === 'request', 'invalid_request');
    const t = task(input.taskRef, input.prUrl);
    fail(contributionDescriptionError(input.description) === null, 'invalid_description');
    fail(input.consent === true && input.consentVersion === REQUEST_CONSENT, 'recipient_consent_required');
    const owner = this.activation.owners[t.ref];
    fail(owner, 'task_owner_unconfirmed', 403);
    fail(t.ref !== 'task-b' || owner === TASK_B_PARTICIPANT, 'task_owner_required', 403);
    const actor = await this.actor(hash!);
    fail(actor.decision === 'approved' && actor.application_id && actor.account_id === owner, 'task_owner_required', 403);
    const recipient = t.ref === 'task-b' ? TASK_B_RECIPIENT : owner;
    fail(input.recipientAccountId === recipient && actor.account_id === recipient, 'recipient_must_match_task_terms');
    return { t, owner, actor, recipient };
  }
  async issueChallenge(id: string, hash: string | null, input: Record<string, unknown>, origin: string) {
    const { t, actor } = await this.requestActor(id, hash, input);
    fail(t.ref === 'task-b', 'invalid_task');
    const c = taskBSigningDesign(input as RequestInput, String(actor.account_id), {
      id: opaqueToken(), nonce: randomBytes(32).toString('base64'), origin, issuedAt: this.clock(),
    });
    // Reuse accepted durable auth storage/grants and its per-account rate budget.
    // Issue only while the same session and exact Task B membership remain live.
    const rows = await this.query(`WITH eligible AS (
      SELECT s.account_id FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      JOIN yawrd.applications a ON ${membership} JOIN yawrd.review_decisions d ON ${approved}
      WHERE ${project} AND s.account_id = $4 AND s.account_id = 'keelbase1.testnet'
    ), budget AS (
      INSERT INTO yawrd.auth_rate_limits(account_id, attempts, resets_at)
      SELECT account_id, 1, clock_timestamp() + interval '1 minute' FROM eligible WHERE true
      ON CONFLICT (account_id) DO UPDATE SET
        attempts = CASE WHEN yawrd.auth_rate_limits.resets_at <= clock_timestamp() THEN 1 ELSE yawrd.auth_rate_limits.attempts + 1 END,
        resets_at = CASE WHEN yawrd.auth_rate_limits.resets_at <= clock_timestamp() THEN clock_timestamp() + interval '1 minute' ELSE yawrd.auth_rate_limits.resets_at END
      WHERE yawrd.auth_rate_limits.resets_at <= clock_timestamp() OR yawrd.auth_rate_limits.attempts < 10 RETURNING account_id
    ) INSERT INTO yawrd.auth_challenges(id, browser_hash, account_id, network, origin, message, recipient, nonce, issued_at, expires_at)
      SELECT $2, $3, account_id, 'testnet', $5, $6, $7, $8, $9::timestamptz, $10::timestamptz FROM budget
      WHERE $10::timestamptz > clock_timestamp() RETURNING id`,
    [hash, c.id, signingSessionHash(hash!), c.accountId, c.origin, c.message, c.recipient, c.nonce, new Date(c.issuedAt).toISOString(), new Date(c.expiresAt).toISOString()]);
    if (!rows.length) {
      await this.requestActor(id, hash, input);
      fail(false, 'too_many_challenges', 429);
    }
    return c;
  }
  private async verifySubmission(hash: string, draft: RequestInput, accountId: string, origin: string, challengeId: unknown, proof: unknown): Promise<IdentityChallenge> {
    requireIdentity(typeof challengeId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(challengeId) && proof, 'submission_signature_required');
    requireIdentity(typeof proof === 'object' && !Array.isArray(proof), 'invalid_signature');
    keys(proof as Record<string, unknown>, ['accountId', 'publicKey', 'signature']);
    const p = proof as IdentityProof;
    requireIdentity(typeof p.accountId === 'string' && typeof p.publicKey === 'string' && typeof p.signature === 'string', 'invalid_signature');
    // Atomic claim BEFORE crypto/RPC: exactly one worker can proceed. Failed
    // proofs/outages consume the challenge, as in the accepted login flow.
    const [row] = await this.query(`UPDATE yawrd.auth_challenges c SET consumed_at = clock_timestamp()
      FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      JOIN yawrd.applications a ON ${membership} JOIN yawrd.review_decisions d ON ${approved}
      WHERE ${project} AND s.account_id = 'keelbase1.testnet'
        AND c.id = $2 AND c.browser_hash = $3 AND c.recipient = $4 AND c.origin = $5
        AND c.account_id = s.account_id AND c.network = s.network AND c.consumed_at IS NULL RETURNING c.*`,
    [hash, challengeId, signingSessionHash(hash), SUBMISSION_RECIPIENT, origin]);
    requireIdentity(row, 'unknown_challenge');
    const c = storedChallenge(row);
    const session = { accountId, origin, network: 'testnet' };
    checkTaskBSignatureDesign(c, draft, session, p, this.clock());
    await this.verifyKey(accountId, p.publicKey);
    checkTaskBSignatureDesign(c, draft, session, p, this.clock());
    return c;
  }
  async submit(id: string, hash: string | null, input: Record<string, unknown>, origin = '') {
    const { challengeId, proof, ...draft } = input;
    const { t, owner, actor, recipient } = await this.requestActor(id, hash, draft);
    const values = [hash, t.ref, owner, t.prUrl, t.head, t.merge, draft.description, recipient, REQUEST_CONSENT];
    if (t.ref === 'task-b') {
      const c = await this.verifySubmission(hash!, draft as RequestInput, String(actor.account_id), origin, challengeId, proof);
      // Challenge consumption alone is never authorization. Only this verified
      // execution reaches the INSERT, which binds the stored exact signed message
      // and rechecks session, membership and expiry in the write statement.
      const [result] = await this.query(`WITH authorized_request AS (
        SELECT p.network, p.id, s.account_id, a.id AS application_id
        FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
        JOIN yawrd.applications a ON ${membership} JOIN yawrd.review_decisions d ON ${approved}
        JOIN yawrd.auth_challenges c ON c.id = $10 AND c.browser_hash = $11
          AND c.message = $12 AND c.recipient = $13 AND c.origin = $14
          AND c.account_id = s.account_id AND c.network = s.network AND c.consumed_at IS NOT NULL
          AND c.issued_at <= clock_timestamp() AND c.expires_at > clock_timestamp()
        WHERE ${project} AND s.account_id = $3 AND s.account_id = $8
      ), inserted AS (
        INSERT INTO yawrd.yaw001_contribution_events
          (network, project_id, task_ref, event_kind, pr_url, pr_head_sha, merge_commit_sha, actor_account_id,
           application_id, description, recipient_account_id, consent_version)
        SELECT network, id, $2, 'request', $4, $5, $6, account_id, application_id, $7, $8, $9 FROM authorized_request WHERE true
        ON CONFLICT (network, project_id, task_ref, event_kind) DO NOTHING RETURNING task_ref
      ) SELECT EXISTS (SELECT 1 FROM authorized_request) AS authorized,
        EXISTS (SELECT 1 FROM inserted) AS inserted`,
      [...values, c.id, signingSessionHash(hash!), c.message, c.recipient, c.origin]);
      if (!result?.authorized) {
        await this.requestActor(id, hash, draft);
        requireIdentity(false, 'expired_challenge');
      }
    } else {
      // Task A remains unmapped in the shipped policy; do not generalize signing.
      fail(challengeId === undefined && proof === undefined, 'invalid_request');
      await this.query(`INSERT INTO yawrd.yaw001_contribution_events
      (network, project_id, task_ref, event_kind, pr_url, pr_head_sha, merge_commit_sha, actor_account_id,
       application_id, description, recipient_account_id, consent_version)
      SELECT p.network, p.id, $2, 'request', $4, $5, $6, s.account_id, a.id, $7, $8, $9
      FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      JOIN yawrd.applications a ON ${membership}
      JOIN yawrd.review_decisions d ON ${approved}
      WHERE ${project} AND s.account_id = $3 AND s.account_id = $8
      ON CONFLICT (network, project_id, task_ref, event_kind) DO NOTHING RETURNING task_ref`,
      values);
    }
    // Fresh authorized statement observes a concurrent winner; never update a fact.
    const view = await this.state(id, hash);
    const saved = view.tasks.find(v => v.ref === t.ref)?.request;
    fail(saved, 'request_unavailable', 409);
    fail(saved.actorAccountId === actor.account_id && saved.recipientAccountId === draft.recipientAccountId && saved.description === draft.description, 'event_conflict', 409);
    return view;
  }
  async acknowledge(id: string, hash: string | null, input: Record<string, unknown>) {
    this.gate(id, hash);
    keys(input, ['kind', 'taskRef', 'prUrl', 'evidence', 'historicalAcceptedOn', 'historicalAcceptedAt', 'consent', 'consentVersion']);
    fail(input.kind === 'acknowledgement', 'invalid_request');
    const t = task(input.taskRef, input.prUrl);
    fail(input.consent === true && input.consentVersion === ACK_CONSENT, 'acknowledgement_consent_required');
    fail(bounded(input.evidence, 2000), 'historical_evidence_required');
    const on = input.historicalAcceptedOn, at = input.historicalAcceptedAt;
    fail(on === null || at === null, 'invalid_historical_precision');
    fail(on === null || (typeof on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(on) && Number.isFinite(Date.parse(on)) && instant(on).slice(0, 10) === on && on <= new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)), 'invalid_historical_date');
    fail(at === null || (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) && Number.isFinite(Date.parse(at)) && instant(at) === at && Date.parse(at) <= Date.now()), 'invalid_historical_time');
    const actor = await this.actor(hash!);
    fail(actor.account_id === 'yawrd1.testnet', 'creator_only', 403);
    await this.query(`INSERT INTO yawrd.yaw001_contribution_events
      (network, project_id, task_ref, event_kind, pr_url, pr_head_sha, merge_commit_sha, actor_account_id,
       consent_version, historical_acceptance_evidence, historical_accepted_on, historical_accepted_at)
      SELECT p.network, p.id, $2, 'acknowledgement', $3, $4, $5, s.account_id, $6, $7, $8::date, $9::timestamptz
      FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      WHERE ${project} AND s.account_id = p.creator_account_id AND s.account_id = 'yawrd1.testnet'
      ON CONFLICT (network, project_id, task_ref, event_kind) DO NOTHING RETURNING task_ref`,
    [hash, t.ref, t.prUrl, t.head, t.merge, ACK_CONSENT, input.evidence, on, at]);
    const view = await this.state(id, hash);
    const saved = view.tasks.find(v => v.ref === t.ref)?.acknowledgement;
    fail(saved, 'acknowledgement_unavailable', 409);
    fail(saved.actorAccountId === actor.account_id && saved.evidence === input.evidence && saved.historicalAcceptedOn === on && saved.historicalAcceptedAt === at, 'event_conflict', 409);
    return view;
  }
}
