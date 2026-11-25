import { creationActionEnabled, creationEnvironment } from './release-environment.ts';
import 'server-only';
import { PreparationRecoveryStore } from './preparation-recovery.ts';
import { RECOVERY_LIMITS,RECOVERY_CONSENT,ORIGINAL_LIMITS,HOSTED_SOL_LIMITS,HOSTED_SOL_PROMPT } from './preparation-generation-contract.ts';
import { randomUUID } from 'node:crypto';
import type { Query } from '../participants/database.ts';
import { fail, WorkflowError } from '../participants/repository.ts';
import type { PreparationBinding, PreparationView } from './preparation-contract.ts';
import { PreparationRepository, preparationDigest, preparationText } from './preparation-repository.ts';
import { readPreparationContext, type PreparationContext } from './preparation-context.ts';
import { generatePreparation, preparationWire } from './preparation-provider.ts';
import { GENERATION_CONSENT,PREMIUM_CONSENT,PREPARATION_PROMPT,QWEN_MODEL,PREMIUM_MODEL,observedAttempt,type PreparationModel,type GenerationAttempt,type GenerationUsage,type GeneratedPreparationView } from './preparation-generation-contract.ts';

/** Only public, accepted placeholder identifiers. Flags remain off until separately authorized. */
export const PREMIUM_TEST_BINDING=Object.freeze({creationId:'yawrd-uorgr4yy5sxu',founderAccountId:'yawrd1.testnet',daoAccountId:'xfheozm6d1tb.factory.yawrd.testnet'});
type Environment=Record<string,string|undefined>;
export function generationPolicy(binding:PreparationBinding,env:Environment=process.env){
  const mode=creationEnvironment(env),hosted=mode==='preview-testnet'||mode==='production-testnet';
  const premium=mode==='development'&&env.YAWRD_ENABLE_CREATION_PREMIUM_TEST==='1'&&binding.creationId===PREMIUM_TEST_BINDING.creationId&&binding.founderAccountId===PREMIUM_TEST_BINDING.founderAccountId&&binding.daoAccountId===PREMIUM_TEST_BINDING.daoAccountId;
  return {enabled:creationActionEnabled('generation',env)&&(env.YAWRD_ENABLE_CREATION_PREMIUM_TEST!=='1'||premium),model:(hosted||premium?PREMIUM_MODEL:QWEN_MODEL) as PreparationModel,
    consentVersion:hosted||premium?PREMIUM_CONSENT:GENERATION_CONSENT,partnerProvider:hosted||premium,hosted,
    promptVersion:hosted?HOSTED_SOL_PROMPT:PREPARATION_PROMPT,limits:hosted?HOSTED_SOL_LIMITS:ORIGINAL_LIMITS};
}
export class PreparationAttemptStore{
  constructor(query:Query){this.query=query;}
  private readonly query:Query;
  async available(hosted=false){
    const [row]=await this.query(`SELECT to_regclass('yawrd.creation_preparation_attempts') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_attempt_read(text,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_reserve(text,text,uuid,bigint,text,text,text,text,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_stage(text,text,uuid,text,jsonb,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_complete(text,text,uuid,text,jsonb)') IS NOT NULL
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid=to_regclass('yawrd.creation_drafts') AND tgname='guard_creation_intake_preparation'
          AND tgfoid=to_regprocedure('yawrd.creation_intake_preparation_guard()')
          AND tgenabled IN ('O','A') AND NOT tgisinternal)
      AND (NOT $1::boolean OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid=to_regclass('yawrd.creation_preparation_attempts')
          AND conname='creation_preparation_hosted_sol_budget' AND convalidated)) AS installed`,[hosted]);
    return row?.installed===true;
  }
  private async run(sql:string,args:unknown[]){
    try{return await this.query(sql,args);}catch(e){
      const error=e as {code?:string;message?:string};
      if(['42P01','42883','42501'].includes(error.code??''))throw new WorkflowError('generation_storage_required',503);
      const codes=['sign_in_required','creation_not_found','preparation_payment_required','generation_binding_changed','generation_attempt_conflict','generation_source_changed','generation_allowance_used','generation_consent_required'];
      if(error.code==='P0001'&&codes.includes(error.message??''))throw new WorkflowError(error.message!,error.message==='sign_in_required'?401:error.message==='creation_not_found'?404:409);
      throw e;
    }
  }
  async read(hash:string,id:string):Promise<GenerationAttempt|null>{
    const [row]=await this.run('SELECT yawrd.creation_preparation_attempt_read($1,$2) AS attempt',[hash,id]);return (row?.attempt??null) as GenerationAttempt|null;
  }
  async reserve(hash:string,id:string,attempt:string,context:PreparationContext,model:PreparationModel,consent:string,requestDigest:string,promptVersion:string=PREPARATION_PROMPT){
    const [row]=await this.run('SELECT yawrd.creation_preparation_reserve($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9) AS won',
      [hash,id,attempt,context.provenance.creationRevision,JSON.stringify(context),model,promptVersion,consent,requestDigest]);return row?.won===true;
  }
  async stage(hash:string,id:string,attempt:string,state:string,usage:GenerationUsage|null=null,error:string|null=null){
    await this.run('SELECT yawrd.creation_preparation_stage($1,$2,$3::uuid,$4,$5::jsonb,$6)',[hash,id,attempt,state,usage?JSON.stringify(usage):null,error]);
  }
  async complete(hash:string,id:string,attempt:string,result:Awaited<ReturnType<typeof generatePreparation>>){
    await this.run('SELECT yawrd.creation_preparation_complete($1,$2,$3::uuid,$4,$5::jsonb)',[hash,id,attempt,preparationText(result.artifacts),JSON.stringify(result.usage)]);
  }
}
type Options={env?:Environment;source?:(hash:string,id:string,binding:PreparationBinding)=>Promise<PreparationContext>;
  provider?:typeof generatePreparation;key?:()=>string|undefined;now?:()=>number};
export class PreparationGenerationService{
  readonly repo:PreparationRepository;readonly store:PreparationAttemptStore;readonly recovery:PreparationRecoveryStore;
  constructor(privateQuery:Query,privateOptions:Options={}){this.query=privateQuery;this.options=privateOptions;this.repo=new PreparationRepository(privateQuery);this.store=new PreparationAttemptStore(privateQuery);this.recovery=new PreparationRecoveryStore(privateQuery);}
  private readonly query:Query;private readonly options:Options;
  async view(hash:string,id:string,original?:PreparationView):Promise<GeneratedPreparationView>{
    let view=original??await this.repo.read(hash,id);
    const policy=generationPolicy(view.binding,this.options.env),installed=await this.store.available(policy.hosted);
    let attempt=installed?observedAttempt(await this.store.read(hash,id),(this.options.now??Date.now)()):null;
    let recovery:import('./preparation-generation-contract.ts').GenerationView['recovery'];
    if(creationEnvironment(this.options.env)==='development'&&attempt?.state==='failed'&&attempt.model===PREMIUM_MODEL){
      const available=await this.recovery.available();
      const record=available?await this.recovery.read(hash,id):null;
      recovery={installed:available,canRecover:!!(record?.eligible&&policy.enabled&&policy.partnerProvider&&!view.versions.length),originalAttempt:record?.originalAttempt??attempt,attempt:record?.attempt?observedAttempt(record.attempt,(this.options.now??Date.now)()):null};
      if(recovery.attempt)attempt=recovery.attempt;
    }
    // Completion can commit between the base read and status read. Never return
    // "saved" with an earlier empty artifact projection and stop the browser poll.
    if(attempt?.state==='saved'&&!view.versions.some(v=>v.revision===attempt.resultRevision))view=await this.repo.read(hash,id);
    const canGenerate=installed&&policy.enabled&&!attempt&&!view.versions.length;
    return {...view,generationEnabled:canGenerate,generation:{installed,canGenerate,model:attempt?.model??policy.model,consentVersion:attempt?(attempt.model===PREMIUM_MODEL?PREMIUM_CONSENT:GENERATION_CONSENT):policy.consentVersion,partnerProvider:attempt?attempt.model===PREMIUM_MODEL:policy.partnerProvider,
      attempt,inputBytesLimit:24000,outputTokensLimit:recovery?.canRecover||recovery?.attempt?16000:attempt?(attempt.outputTokensLimit??8000):policy.limits.outputTokens,providerTimeoutMs:recovery?.canRecover||recovery?.attempt?420000:attempt?(attempt.providerTimeoutMs??180000):policy.limits.providerTimeoutMs,allowance:1,...(recovery?{recovery}:{})}};
  }
  async recover(hash:string,id:string,consent:unknown,consentVersion:unknown){
    const original=await this.repo.read(hash,id),policy=generationPolicy(original.binding,this.options.env);
    fail(creationEnvironment(this.options.env)==='development'&&policy.enabled&&policy.partnerProvider&&policy.model===PREMIUM_MODEL,'recovery_not_eligible',403);
    fail(consent===true&&consentVersion===RECOVERY_CONSENT,'generation_consent_required');
    const view=await this.view(hash,id,original);
    fail(view.generation.recovery?.installed,'recovery_storage_required',503);
    if(view.generation.recovery.attempt)return view;
    fail(view.generation.recovery.canRecover&&!view.versions.length,'recovery_not_eligible',409);
    const source=await this.recovery.source(hash,id),wire=preparationWire(source,PREMIUM_MODEL,RECOVERY_LIMITS);
    const key=(this.options.key??(()=>process.env.YAWRD_NEAR_AI_API_KEY))();fail(key,'provider_credentials_missing',503);
    const attempt=randomUUID(),parent=view.generation.recovery.originalAttempt!;
    const won=await this.recovery.reserve(hash,id,attempt,parent.id,RECOVERY_CONSENT,preparationDigest(wire.body));
    if(!won)return this.view(hash,id);
    try{
      await this.recovery.stage(hash,id,attempt,'waiting');
      const result=await (this.options.provider??generatePreparation)(source,PREMIUM_MODEL,key,()=>this.recovery.stage(hash,id,attempt,'checking'),undefined,RECOVERY_LIMITS);
      if(!result.artifacts)await this.recovery.stage(hash,id,attempt,'failed',result.usage,result.failure);
      else await this.recovery.complete(hash,id,attempt,result);
    }catch(e){
      const code=e instanceof WorkflowError?e.code:'generation_completion_unknown';
      const known=['generation_output_invalid','provider_access_unavailable','provider_billing_or_limit'].includes(code);
      const safe=['generation_output_invalid','provider_access_unavailable','provider_billing_or_limit','provider_deadline_exceeded','provider_transport_failed','provider_response_incomplete','provider_unavailable_no_retry'].includes(code)?code:'generation_completion_unknown';
      try{await this.recovery.stage(hash,id,attempt,known?'failed':'unknown',null,safe);}catch{/* Never release or reset the reservation. */}
      if(code==='sign_in_required'||code==='creation_not_found')throw e;
    }
    return this.view(hash,id);
  }
  async generate(hash:string,id:string,consent:unknown,consentVersion:unknown){
    const original=await this.repo.read(hash,id),view=await this.view(hash,id,original),policy=generationPolicy(original.binding,this.options.env);
    fail(policy.enabled,'generation_not_enabled',403);fail(view.generation.installed,'generation_storage_required',503);
    fail(consent===true&&consentVersion===policy.consentVersion,'generation_consent_required');
    // An existing attempt consumes the finite allowance even if the request response was lost.
    if(view.generation.attempt)return view;
    fail(!view.versions.length,'generation_allowance_used',409);
    const source=await (this.options.source??((s,i,b)=>readPreparationContext(this.query,s,i,b)))(hash,id,original.binding);
    const wire=preparationWire(source,policy.model,policy.limits);
    const key=(this.options.key??(()=>process.env.YAWRD_NEAR_AI_API_KEY))();fail(key,'provider_credentials_missing',503);
    const attempt=randomUUID(),won=await this.store.reserve(hash,id,attempt,source,policy.model,policy.consentVersion,preparationDigest(wire.body),policy.promptVersion);
    if(!won)return this.view(hash,id);
    try{
      await this.store.stage(hash,id,attempt,'waiting');
      const result=await (this.options.provider??generatePreparation)(source,policy.model,key,()=>this.store.stage(hash,id,attempt,'checking'),undefined,policy.limits);
      if(!result.artifacts){await this.store.stage(hash,id,attempt,'failed',result.usage,result.failure);return this.view(hash,id);}
      await this.store.complete(hash,id,attempt,result);
    }catch(e){
      const code=e instanceof WorkflowError?e.code:'generation_completion_unknown';
      const known=['generation_output_invalid','provider_access_unavailable','provider_billing_or_limit'].includes(code);
      const safe=['generation_output_invalid','provider_access_unavailable','provider_billing_or_limit','provider_deadline_exceeded','provider_transport_failed','provider_response_incomplete','provider_unavailable_no_retry'].includes(code)?code:'generation_completion_unknown';
      try{await this.store.stage(hash,id,attempt,known?'failed':'unknown',null,safe);}catch{/* Preserve the claim; overdue reads derive uncertainty without a new dispatch. */}
      if(code==='sign_in_required'||code==='creation_not_found')throw e;
    }
    return this.view(hash,id);
  }
}
