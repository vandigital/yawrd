import { randomUUID } from 'node:crypto';
import type { Query, Row } from './database.ts';
import type { AgentAssociation, Application, ParticipantView, PersistedProject } from './types.ts';
import { GENESIS_YAW_001, GENESIS_PUBLICATION_CONSENT_VERSION, matchesGenesisIdentity, matchesGenesisProject, type GenesisDraftStatus, type GenesisPublication } from '../genesis/yaw-001.ts';

export class WorkflowError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export function fail(condition: unknown, code: string, status = 400): asserts condition {
  if (!condition) throw new WorkflowError(code, status);
}
const liveSession = `s.token_hash = $2 AND s.network = 'testnet' AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()`;
function application(row: Row): Application {
  return { id: String(row.id), accountId: String(row.account_id), introduction: String(row.introduction), status: (row.decision ?? 'pending') as Application['status'], reviewerAccountId: row.reviewer_account_id ? String(row.reviewer_account_id) : null };
}
function persistedProject(p: Row): PersistedProject {
  return { id: String(p.id), network: 'testnet', creatorAccountId: String(p.creator_account_id), name: String(p.name), description: String(p.description), objectives: [...p.objectives as string[]], participation: String(p.participation), rewards: String(p.rewards) };
}

export class ParticipantRepository {
  readonly query: Query;
  constructor(query: Query) { this.query = query; }

  async genesisStatus(hash: string | null): Promise<GenesisDraftStatus> {
    fail(hash, 'sign_in_required', 401);
    const g = GENESIS_YAW_001;
    // Unauthorized sessions cannot join unpublished project fields. Both the ID
    // and DAO are checked so an association under another ID is also a conflict.
    const rows = await this.query(`SELECT s.account_id, p.id, p.network, p.creator_account_id, p.dao_account_id,
      p.name, p.description, p.objectives, p.participation, p.rewards, p.published_at, p.created_at
      FROM yawrd.sessions s LEFT JOIN yawrd.projects p ON p.network = 'testnet'
        AND (p.id = $1 OR p.dao_account_id = $3) AND s.account_id = $4
      WHERE ${liveSession}`, [g.id, hash, g.daoAccountId, g.creatorAccountId]);
    fail(rows.length, 'sign_in_required', 401);
    fail(rows[0].account_id === g.creatorAccountId, 'creator_only', 403);
    fail(rows.length === 1, 'genesis_conflict', 409);
    const p = rows[0];
    if (p.id === null) return { linked: false, project: null };
    fail(matchesGenesisProject(p), 'genesis_conflict', 409);
    return { linked: true, project: { ...persistedProject(p), daoAccountId: g.daoAccountId, publishedAt: null, createdAt: new Date(p.created_at as string | Date).toISOString() } };
  }

  async linkGenesis(hash: string | null): Promise<GenesisDraftStatus> {
    fail(hash, 'sign_in_required', 401);
    const g = GENESIS_YAW_001;
    // The existing published_at default is NULL. No INSERT permission on that
    // column is needed or granted. Actor authorization occurs in the write itself.
    await this.query(`INSERT INTO yawrd.projects(network, id, creator_account_id, dao_account_id, name, description, objectives, participation, rewards)
      SELECT 'testnet', $1, s.account_id, $3, $5, $6, $7::jsonb, $8, $9
      FROM yawrd.sessions s WHERE ${liveSession} AND s.account_id = $4
      ON CONFLICT DO NOTHING`, [g.id, hash, g.daoAccountId, g.creatorAccountId, g.name, g.description, JSON.stringify(g.objectives), g.participation, g.rewards]);
    // A separate statement observes the concurrent winner after either unique
    // constraint waits. Never update an existing record, even on identical retries.
    const status = await this.genesisStatus(hash);
    fail(status.linked, 'genesis_conflict', 409);
    return status;
  }

  async publishGenesis(hash: string | null, consent: unknown, consentVersion: unknown): Promise<GenesisPublication> {
    fail(hash, 'sign_in_required', 401);
    fail(consent === true && consentVersion === GENESIS_PUBLICATION_CONSENT_VERSION, 'publication_consent_required');
    const g = GENESIS_YAW_001;
    const receipt = (publishedAt: unknown): GenesisPublication => ({ published: true, projectId: g.id, network: g.network, publishedAt: new Date(publishedAt as string | Date).toISOString() });
    // Authorize and compare every canonical field in the atomic write. The NULL
    // predicate preserves the first timestamp and avoids updates on retries.
    const updated = await this.query(`UPDATE yawrd.projects p SET published_at = statement_timestamp()
      FROM yawrd.sessions s WHERE ${liveSession} AND s.account_id = $4
        AND p.network = 'testnet' AND p.id = $1 AND p.creator_account_id = s.account_id
        AND p.creator_account_id = $4 AND p.dao_account_id = $3
        AND p.name = $5 AND p.description = $6 AND p.objectives = $7::jsonb
        AND p.participation = $8 AND p.rewards = $9 AND p.published_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM yawrd.projects other WHERE other.network = p.network
          AND other.dao_account_id = $3 AND other.id <> p.id)
      RETURNING p.published_at`, [g.id, hash, g.daoAccountId, g.creatorAccountId, g.name, g.description, JSON.stringify(g.objectives), g.participation, g.rewards]);
    if (updated.length) {
      fail(updated.length === 1, 'genesis_conflict', 409);
      return receipt(updated[0].published_at);
    }
    // A new statement sees the committed concurrent winner after UPDATE waits.
    // This read diagnoses denials/conflicts or returns the original publication.
    const rows = await this.query(`SELECT s.account_id, p.id, p.network, p.creator_account_id, p.dao_account_id,
      p.name, p.description, p.objectives, p.participation, p.rewards, p.published_at
      FROM yawrd.sessions s LEFT JOIN yawrd.projects p ON p.network = 'testnet'
        AND (p.id = $1 OR p.dao_account_id = $3) AND s.account_id = $4
      WHERE ${liveSession}`, [g.id, hash, g.daoAccountId, g.creatorAccountId]);
    fail(rows.length, 'sign_in_required', 401);
    fail(rows[0].account_id === g.creatorAccountId, 'creator_only', 403);
    fail(rows.length === 1, 'genesis_conflict', 409);
    fail(rows[0].id !== null, 'not_found', 404);
    fail(matchesGenesisIdentity(rows[0]), 'genesis_conflict', 409);
    fail(rows[0].published_at != null, 'publication_unavailable', 409);
    return receipt(rows[0].published_at);
  }

  async agentAssociation(id: string, sessionHash: string): Promise<AgentAssociation | null> {
    const [row] = await this.query(`SELECT s.account_id, d.application_id, g.agent_reference, g.consent_version, g.authorized_at
      FROM yawrd.projects p LEFT JOIN yawrd.sessions s ON ${liveSession}
      LEFT JOIN yawrd.applications a ON a.network = p.network AND a.project_id = p.id AND a.account_id = s.account_id
      LEFT JOIN yawrd.review_decisions d ON d.application_id = a.id AND d.decision = 'approved'
      LEFT JOIN yawrd.agent_associations g ON g.application_id = d.application_id AND g.network = p.network AND g.project_id = p.id
      WHERE p.network = 'testnet' AND p.id = $1 AND p.published_at IS NOT NULL`, [id, sessionHash]);
    fail(row, 'not_found', 404);
    fail(row.account_id, 'sign_in_required', 401);
    // A creator role alone is insufficient. Check approved membership even for reads.
    fail(row.application_id, 'approved_participant_required', 403);
    if (row.agent_reference == null) return null;
    return { network: 'testnet', projectId: id, applicationId: String(row.application_id), operatorAccountId: String(row.account_id), agentReference: String(row.agent_reference), consentVersion: 'agent-association-v1', authorizedAt: new Date(row.authorized_at as string | Date).toISOString() };
  }

  async associateAgent(id: string, sessionHash: string, agentReference: unknown, consent: unknown, consentVersion: unknown) {
    fail(consent === true && consentVersion === 'agent-association-v1', 'association_consent_required');
    // Opaque human-attested identifier, never fetched or treated as an agent credential.
    fail(typeof agentReference === 'string' && agentReference.length <= 200 && /^[A-Za-z0-9]/.test(agentReference) && !/[^A-Za-z0-9._:/@-]/.test(agentReference), 'invalid_agent_reference');
    await this.query(`INSERT INTO yawrd.agent_associations(application_id, network, project_id, agent_reference, consent_version)
      SELECT a.id, p.network, p.id, $3, 'agent-association-v1'
      FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      JOIN yawrd.applications a ON a.network = p.network AND a.project_id = p.id AND a.account_id = s.account_id
      JOIN yawrd.review_decisions d ON d.application_id = a.id AND d.decision = 'approved'
      WHERE p.network = 'testnet' AND p.id = $1 AND p.published_at IS NOT NULL
      ON CONFLICT (application_id) DO NOTHING`, [id, sessionHash, agentReference]);
    // Separate statement sees a concurrent winner after the unique constraint waits.
    const association = await this.agentAssociation(id, sessionHash);
    fail(association, 'association_unavailable', 409);
    fail(association.agentReference === agentReference, 'association_conflict', 409);
    return association;
  }

  async project(id: string): Promise<PersistedProject | null> {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id) || id === 'the-common-table') return null;
    const [p] = await this.query(`SELECT id, network, creator_account_id, name, description, objectives, participation, rewards
      FROM yawrd.projects WHERE network = 'testnet' AND id = $1 AND published_at IS NOT NULL`, [id]);
    if (!p) return null;
    return persistedProject(p);
  }

  async view(id: string, sessionHash: string | null): Promise<ParticipantView> {
    // A single statement uses one snapshot. Restricted text never enters this
    // result unless the live session is the creator or has an approved decision.
    const [row] = await this.query(`SELECT s.account_id,
      (s.account_id = p.creator_account_id) AS is_creator,
      EXISTS (SELECT 1 FROM yawrd.applications a JOIN yawrd.review_decisions d ON d.application_id = a.id
        WHERE a.network = p.network AND a.project_id = p.id AND a.account_id = s.account_id AND d.decision = 'approved') AS is_participant,
      CASE WHEN s.account_id = p.creator_account_id OR EXISTS (
        SELECT 1 FROM yawrd.applications a JOIN yawrd.review_decisions d ON d.application_id = a.id
        WHERE a.network = p.network AND a.project_id = p.id AND a.account_id = s.account_id AND d.decision = 'approved'
      ) THEN (SELECT content FROM yawrd.restricted_content r WHERE r.network = p.network AND r.project_id = p.id) END AS restricted_content,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'account_id', a.account_id, 'introduction', a.introduction,
        'decision', d.decision, 'reviewer_account_id', d.reviewer_account_id) ORDER BY a.created_at, a.id)
        FROM yawrd.applications a LEFT JOIN yawrd.review_decisions d ON d.application_id = a.id
        WHERE a.network = p.network AND a.project_id = p.id AND (s.account_id = p.creator_account_id OR s.account_id = a.account_id)), '[]'::jsonb) AS applications
      FROM yawrd.projects p LEFT JOIN yawrd.sessions s ON ${liveSession}
      WHERE p.network = 'testnet' AND p.id = $1 AND p.published_at IS NOT NULL`, [id, sessionHash]);
    fail(row, 'not_found', 404);
    const applications = (row.applications as Row[]).map(application);
    const isCreator = row.is_creator === true;
    return { accountId: row.account_id ? String(row.account_id) : null, role: isCreator ? 'creator' : row.is_participant === true ? 'participant' : 'public', application: applications.find(a => a.accountId === row.account_id) ?? null, applications: isCreator ? applications : [], restrictedContent: row.restricted_content == null ? null : String(row.restricted_content) };
  }

  async apply(id: string, sessionHash: string, introduction: unknown, consent: unknown) {
    fail(typeof introduction === 'string' && introduction.trim().length > 0 && introduction.trim().length <= 1000 && consent === true, 'introduction_and_consent_required');
    const rows = await this.query(`INSERT INTO yawrd.applications(id, network, project_id, account_id, introduction, consent_version)
      SELECT $3::uuid, p.network, p.id, s.account_id, $4, 'participant-v1'
      FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      WHERE p.id = $1 AND p.network = 'testnet' AND p.published_at IS NOT NULL AND s.account_id <> p.creator_account_id
      ON CONFLICT (network, project_id, account_id) DO NOTHING RETURNING id`, [id, sessionHash, randomUUID(), introduction.trim()]);
    // Separate read sees a concurrent winner after ON CONFLICT waits. Retries
    // return the original introduction and decision without overwriting consent.
    const view = await this.view(id, sessionHash);
    fail(view.accountId, 'sign_in_required', 401);
    fail(view.role !== 'creator', 'creator_cannot_apply', 403);
    fail(rows.length || view.application, 'application_unavailable', 409);
    return view;
  }

  async review(id: string, sessionHash: string, applicationId: unknown, decision: unknown) {
    fail(typeof applicationId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(applicationId) && (decision === 'approved' || decision === 'rejected'), 'invalid_review');
    await this.query(`INSERT INTO yawrd.review_decisions(application_id, network, project_id, reviewer_account_id, decision)
      SELECT a.id, p.network, p.id, s.account_id, $4
      FROM yawrd.projects p JOIN yawrd.sessions s ON ${liveSession}
      JOIN yawrd.applications a ON a.network = p.network AND a.project_id = p.id AND a.id = $3::uuid
      WHERE p.id = $1 AND p.network = 'testnet' AND p.published_at IS NOT NULL AND s.account_id = p.creator_account_id
      ON CONFLICT (application_id) DO NOTHING`, [id, sessionHash, applicationId, decision]);
    const view = await this.view(id, sessionHash);
    fail(view.accountId, 'sign_in_required', 401);
    fail(view.role === 'creator', 'creator_only', 403);
    const reviewed = view.applications.find(a => a.id === applicationId);
    fail(reviewed, 'application_not_found', 404);
    fail(reviewed.status === decision, 'decision_conflict', 409);
    return view;
  }
}
