import 'server-only';
import { boundedReadRpc } from '../platform-fee/verification.ts';
import type { Rpc } from '../creation-integration.ts';
import type { ProjectFunds } from './launch-preparation.ts';
/** Observation only. Neither account balance nor setup fees are a reward commitment. */
export async function readLaunchFunds(accountId: string, transport: Rpc): Promise<ProjectFunds> {
  try {
    const rpc=boundedReadRpc(transport, 4000);
    if ((await rpc('status',{})).chain_id!=='testnet') return {status:'unknown'};
    const block=(await rpc('block',{finality:'final'}))?.header;
    if (!Number.isSafeInteger(block?.height) || block.height<=0 || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(block?.hash)) return {status:'unknown'};
    const a=await rpc('query',{request_type:'view_account',account_id:accountId,block_id:block.hash});
    if (![a?.amount,a?.locked].every(v=>typeof v==='string' && /^[0-9]{1,40}$/.test(v)) || a.block_hash!==block.hash || a.block_height!==block.height) return {status:'unknown'};
    return {status:'observed',amountYocto:a.amount,lockedYocto:a.locked,blockHeight:block.height,blockHash:block.hash};
  } catch { return {status:'unknown'}; }
}
