import 'server-only';
import type { Query, Row } from '../participants/database.ts';
import type { ProposedYawrdPreview } from './yawrd-preview.ts';
import { PUBLIC_ID_PATTERN } from '../project-identity.ts';

function project(row: Row) {
  const p = row.payload as ProposedYawrdPreview;
  // A second allowlist at the public response boundary. Never read private tables here.
  const payload: ProposedYawrdPreview = { name:p.name,description:p.description,fundingPlan:p.fundingPlan,
    progress:{accepted:null,planned:p.tasks.length},tasks:p.tasks.map(t=>({id:t.id,title:t.title,summary:t.summary,
      deliverables:[...t.deliverables],dependencies:t.dependencies.map(d=>({title:d.title,included:d.included})),
      allocation:t.allocation,rewardTerms:t.rewardTerms})) };
  return {id:String(row.id),creatorAccountId:String(row.creator_account_id),payload};
}
async function read(query: Query, sql: string, values: unknown[] = []) {
  try { return await query(sql,values); }
  catch (error) {
    if (['42P01','3F000'].includes((error as {code?:string}).code ?? '')) return [];
    throw error;
  }
}
export async function publicGeneralizedYawrd(query: Query, id: string) {
  if (!PUBLIC_ID_PATTERN.test(id)) return null;
  const [row] = await read(query,'SELECT id,creator_account_id,payload FROM yawrd_publication.public_yawrds WHERE id=$1',[id]);
  return row ? project(row) : null;
}
export async function discoverGeneralizedYawrds(query: Query) {
  const rows = await read(query,'SELECT id,creator_account_id,payload,published_at FROM yawrd_publication.public_yawrds ORDER BY published_at DESC,id LIMIT 100');
  return rows.map(row=>{
    const value=row.published_at;
    const date=value instanceof Date?value:typeof value==='string'?new Date(value):null;
    return {...project(row),publishedAt:date&&Number.isFinite(date.getTime())?date.toISOString():null};
  });
}
