import 'server-only';
import type { Query } from '../participants/database.ts';
export type PublicRewards = { revision: number; total: string; T1: string; T2: string };
export function nearAmount(value: string) {
  const padded = value.padStart(25, '0'), fraction = padded.slice(-24).replace(/0+$/, '');
  return padded.slice(0, -24) + (fraction ? '.' + fraction : '');
}
export async function publicWordWakeRewards(query: Query, snapshot: unknown): Promise<PublicRewards | null> {
  if (typeof snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot)) return null;
  try {
    const rows = await query(`WITH latest AS (
      SELECT * FROM yawrd.wordwake_reward_plans WHERE network='testnet' AND project_id='yaw-002'
      ORDER BY revision DESC LIMIT 1
    ) SELECT r.revision,r.total_yocto::text AS total,
      r.terms_text::jsonb#>>'{allocations,0,amountYocto}' AS t1,
      r.terms_text::jsonb#>>'{allocations,1,amountYocto}' AS t2
      FROM latest r WHERE r.snapshot_sha256=$1 AND r.package_version=$2
      AND r.approved_by='yawrd1.testnet' AND r.dao_account_id='wordwake-build.factory.yawrd.testnet'
      AND r.mode='paid' AND r.currency='NEAR' AND NOT r.unpaid_confirmed
      AND r.consent_version='wordwake-reward-approval-v1'
      AND r.terms_sha256=encode(sha256(convert_to(r.terms_text,'UTF8')),'hex')
      AND r.terms_text::jsonb @> jsonb_build_object('schema','yawrd.reward-approval.v1','network','testnet',
        'projectId','yaw-002','packageVersion',r.package_version,'snapshotSha256',r.snapshot_sha256,
        'founder',r.approved_by,'projectAccount',r.dao_account_id,'revision',r.revision,'mode','paid',
        'currency','NEAR','consentVersion',r.consent_version,'totalYocto',r.total_yocto::text)
      AND r.terms_text::jsonb->'allocations' = (SELECT jsonb_agg(jsonb_build_object(
        'taskId',a.task_ref,'amountYocto',a.amount_yocto::text) ORDER BY a.task_ref)
        FROM yawrd.wordwake_reward_allocations a WHERE a.network=r.network AND a.project_id=r.project_id
        AND a.revision=r.revision AND a.package_version=r.package_version)
      AND jsonb_array_length(r.terms_text::jsonb->'allocations')=2
      AND r.terms_text::jsonb#>>'{allocations,0,taskId}'='T1'
      AND r.terms_text::jsonb#>>'{allocations,1,taskId}'='T2'`, [snapshot,'yaw-002-wordwake-ww-v1-r1']);
    if (rows.length !== 1) return null;
    const r=rows[0], amount=(v:unknown):v is string=>typeof v==='string' && /^[1-9][0-9]{0,38}$/.test(v);
    if (!Number.isSafeInteger(r.revision) || Number(r.revision)<1 || !amount(r.total) || !amount(r.t1) || !amount(r.t2)
      || BigInt(r.t1)+BigInt(r.t2)!==BigInt(r.total)) return null;
    return {revision:Number(r.revision),total:nearAmount(r.total),T1:nearAmount(r.t1),T2:nearAmount(r.t2)};
  } catch { return null; } // Unavailable evidence never becomes an invented allocation.
}
