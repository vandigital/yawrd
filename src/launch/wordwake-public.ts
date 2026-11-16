import { publicWordWakeRewards, type PublicRewards } from './wordwake-public-rewards.ts';
import 'server-only';
import type { Query } from '../participants/database.ts';
import type { PersistedProject } from '../participants/types.ts';
import { WORDWAKE_PUBLIC_IDENTITY as project, WORDWAKE_PUBLIC_REVIEW as trust, PUBLIC_PARTICIPATION, PUBLIC_REWARDS } from './wordwake-public-config.ts';
import { fail } from '../participants/repository.ts';

export type PublishedWordWake = PersistedProject & {
  publishedAt: string; rewardPlan: PublicRewards | null;
  reviewed: { packageVersion: string; contractVersion: string; reviewedOn: string;
    principles: string[]; tracks: { id: 'T1' | 'T2'; title: string; summary: string }[] };
};

/** Public summaries only. Full documents, intake, Skill and task definitions never enter this result. */
export async function publicWordWake(query: Query): Promise<PublishedWordWake | null> {
  const rows = await query(`SELECT p.id,p.published_at,pkg.snapshot_sha256,pkg.package_version,pkg.contract_version,
    pkg.snapshot#>>'{package,record,review,recordedOn}' AS reviewed_on,
    pkg.snapshot#>'{package,record,review,approvedDefaults}' AS principles,
    pkg.snapshot#>>'{package,record,taskPresentation,T1,label}' AS t1_title,
    pkg.snapshot#>>'{package,record,taskPresentation,T1,objective}' AS t1_summary,
    pkg.snapshot#>>'{package,record,taskPresentation,T2,label}' AS t2_title,
    pkg.snapshot#>>'{package,record,taskPresentation,T2,objective}' AS t2_summary
    FROM yawrd.projects p JOIN yawrd.reviewed_project_packages pkg ON pkg.network=p.network AND pkg.project_id=p.id
    JOIN yawrd.project_draft_reviews review ON review.network=pkg.network AND review.project_id=pkg.project_id
      AND review.package_version=pkg.package_version
    WHERE p.network='testnet' AND p.id=$1 AND p.creator_account_id=$2 AND p.dao_account_id=$3
      AND p.published_at IS NOT NULL AND pkg.founder_account_id=p.creator_account_id AND pkg.dao_account_id=p.dao_account_id
      AND pkg.package_version=$4 AND pkg.review_record_sha256=$5 AND pkg.contract_version=$6
      AND review.snapshot_sha256=pkg.snapshot_sha256 AND review.reviewer_account_id=p.creator_account_id
      AND pkg.snapshot_sha256=encode(sha256(convert_to(pkg.snapshot_text,'UTF8')),'hex')
      AND (SELECT count(*) FROM yawrd.project_task_drafts t WHERE t.network=pkg.network AND t.project_id=pkg.project_id
        AND t.package_version=pkg.package_version AND t.publication_status='draft' AND t.task_ref IN ('T1','T2'))=2`,
  [project.id, project.founderAccountId, project.daoAccountId, trust.packageVersion, trust.reviewRecordSha256, trust.contractVersion]);
  if (rows.length !== 1) return null;
  const row=rows[0], publishedAt=new Date(row.published_at as string).toISOString();
  const shortText=(value:unknown):value is string=>typeof value==='string' && value.trim().length>0 && value.length<=1000;
  fail(row.package_version===trust.packageVersion && row.contract_version===trust.contractVersion
    && typeof row.reviewed_on==='string' && /^\d{4}-\d{2}-\d{2}$/.test(row.reviewed_on)
    && Array.isArray(row.principles) && row.principles.length>0 && row.principles.length<=20 && row.principles.every(shortText)
    && [row.t1_title,row.t1_summary,row.t2_title,row.t2_summary].every(shortText), 'public_review_unavailable',503);
  const rewardPlan = await publicWordWakeRewards(query,row.snapshot_sha256);
  return { id: project.id, network: 'testnet', creatorAccountId: project.founderAccountId,
    rewardPlan,
    name: project.name, description: project.description, objectives: [...project.objectives],
    participation: PUBLIC_PARTICIPATION, rewards: rewardPlan ? `The founder approved ${rewardPlan.total} Testnet NEAR across two reviewed tasks. Accepted work and separate Steward approval are required before payout.` : 'Current reward terms could not be verified. No allocation or payment is confirmed here.', publishedAt,
    reviewed: { packageVersion:trust.packageVersion,contractVersion:trust.contractVersion,reviewedOn:row.reviewed_on,
      principles:[...row.principles as string[]],tracks:[
        {id:'T1',title:row.t1_title as string,summary:row.t1_summary as string},
        {id:'T2',title:row.t2_title as string,summary:row.t2_summary as string},
      ] } };
}
