import 'server-only';
import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { cookie, errorResponse, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { PAYOUT, type PayoutContext } from './payout.ts';

/** Narrow payout prerequisite view for the two fixed Stewards. No profiles,
 * introductions, descriptions or private acknowledgement text are exposed. */
export async function payoutContext(query: Query, hash: string | null): Promise<PayoutContext> {
  fail(hash, 'sign_in_required', 401);
  const rows = await query(`SELECT s.account_id,
    (r.task_ref IS NOT NULL AND a.task_ref IS NOT NULL) AS acknowledged, a.recorded_at AS acknowledged_at
    FROM yawrd.projects p JOIN yawrd.sessions s ON s.token_hash = $1 AND s.network = p.network
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
    LEFT JOIN yawrd.yaw001_contribution_events r ON r.network = p.network AND r.project_id = p.id
      AND r.task_ref = 'task-b' AND r.event_kind = 'request' AND r.actor_account_id = $2
      AND r.recipient_account_id = $2 AND r.pr_url = $3 AND r.merge_commit_sha = $4
    LEFT JOIN yawrd.yaw001_contribution_events a ON a.network = p.network AND a.project_id = p.id
      AND a.task_ref = 'task-b' AND a.event_kind = 'acknowledgement' AND a.actor_account_id = $5
      AND a.pr_url = $3 AND a.merge_commit_sha = $4
    WHERE p.network = 'testnet' AND p.id = 'yaw-001' AND p.published_at IS NOT NULL
      AND p.creator_account_id = $5 AND p.dao_account_id = $6
      AND s.account_id = ANY($7::text[])`,
  [hash, PAYOUT.recipient, PAYOUT.prUrl, PAYOUT.merge, PAYOUT.creator, PAYOUT.daoAccountId, [...PAYOUT.stewards]]);
  fail(rows.length === 1 && PAYOUT.stewards.includes(String(rows[0].account_id)), 'steward_sign_in_required', 403);
  const row = rows[0];
  return { accountId: String(row.account_id), acknowledged: row.acknowledged === true,
    acknowledgedAt: row.acknowledged === true && row.acknowledged_at ? new Date(row.acknowledged_at as string | Date).toISOString() : null };
}
export async function payoutContextRequest(request: Request, id: string, query: Query, origin: string | null) {
  try {
    fail(id === 'yaw-001', 'not_found', 404);
    fail(request.method === 'GET', 'method_not_allowed', 405);
    sameOrigin(request, origin, false);
    fail(!new URL(request.url).search, 'invalid_request');
    return json(await payoutContext(query, sessionHash(cookie(request, SESSION_COOKIE))));
  } catch (error) { return errorResponse(error); }
}
