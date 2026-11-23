import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { PreparationRepository } from './preparation-repository.ts';
import { PREPARATION_BYTES, PreparationInputError } from './preparation-contract.ts';
import type { PreparationGenerationService } from './preparation-generation.ts';

export async function preparationRequest(request:Request,id:string,query:Query,origin:string|null,generation?:PreparationGenerationService){
  try{
    const read=request.method==='GET';
    fail(read||request.method==='POST','method_not_allowed',405);
    sameOrigin(request,origin,!read);fail(!new URL(request.url).search,'invalid_request');
    const hash=sessionHash(cookie(request,SESSION_COOKIE));fail(hash,'sign_in_required',401);
    async function account(){
      const [session]=await query(`SELECT account_id FROM yawrd.sessions WHERE token_hash=$1 AND network='testnet'
        AND revoked_at IS NULL AND expires_at>clock_timestamp()`,[hash]);
      fail(session,'sign_in_required',401);
      fail(request.headers.get('x-yawrd-account')===session.account_id,'creation_session_changed',409);
    }
    await account();
    const repo=new PreparationRepository(query);
    // Authorize owner and paid binding before consuming private request content.
    const original=await repo.read(hash,id);
    if(read){const view=generation?await generation.view(hash,id,original):original;await account();return json(view);}
    const data=await body(request,PREPARATION_BYTES+4096);
    let view;
    if(data.action==='generate'&&generation){
      fields(data,['action','consent','consentVersion']);
      view=await generation.generate(hash,id,data.consent,data.consentVersion);
    }else if(data.action==='recover'&&generation){
      fields(data,['action','consent','consentVersion']);
      view=await generation.recover(hash,id,data.consent,data.consentVersion);
    }else if(data.action==='save'){
      fields(data,['action','expectedRevision','expectedDigest','artifacts']);
      view=await repo.save(hash,id,data.expectedRevision,data.expectedDigest,data.artifacts);
    }else{
      fail(data.action==='approve','invalid_request');
      fields(data,['action','expectedRevision','expectedDigest','consent','consentVersion']);
      view=await repo.approve(hash,id,data.expectedRevision,data.expectedDigest,data.consent,data.consentVersion);
    }
    await account();return json(generation&&data.action!=='generate'&&data.action!=='recover'?await generation.view(hash,id,view):view);
  }catch(error){
    if(error instanceof PreparationInputError)return json({error:'invalid_preparation'},400);
    return errorResponse(error);
  }
}
