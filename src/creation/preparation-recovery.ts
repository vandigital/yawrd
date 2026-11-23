import 'server-only';
import type { Query } from '../participants/database.ts';
import { fail, WorkflowError } from '../participants/repository.ts';
import { preparationText } from './preparation-repository.ts';
import type { PreparationContext } from './preparation-context.ts';
import type { GenerationAttempt, GeneratedPreparation, GenerationUsage } from './preparation-generation-contract.ts';

export type RecoveryRecord={eligible:boolean;originalAttempt:GenerationAttempt;attempt:GenerationAttempt|null};
/** One recovery linked to the immutable failed original; no update/reset of that row. */
export class PreparationRecoveryStore {
  private readonly query:Query;
  constructor(query:Query){this.query=query;}
  async available(){
    const [row]=await this.query(`SELECT to_regclass('yawrd.creation_preparation_recoveries') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_recovery_read(text,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_recovery_source(text,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_recovery_reserve(text,text,uuid,uuid,text,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_recovery_stage(text,text,uuid,text,jsonb,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_preparation_recovery_complete(text,text,uuid,text,jsonb)') IS NOT NULL
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=to_regclass('yawrd.creation_preparation_recoveries')
        AND tgname='guard_creation_preparation_recovery' AND tgfoid=to_regprocedure('yawrd.creation_preparation_recovery_guard()') AND tgenabled IN ('O','A')) AS installed`);
    return row?.installed===true;
  }
  private async run(sql:string,args:unknown[]){
    try{return await this.query(sql,args);}catch(e){
      const error=e as {code?:string;message?:string};
      if(['42P01','42883','42501'].includes(error.code??''))throw new WorkflowError('recovery_storage_required',503);
      const codes=['recovery_not_eligible','generation_attempt_conflict','generation_consent_required','sign_in_required','creation_not_found','preparation_payment_required','preparation_binding_conflict','creation_revision_conflict'];
      if(error.code==='P0001'&&codes.includes(error.message??''))throw new WorkflowError(error.message!,error.message==='sign_in_required'?401:error.message==='creation_not_found'?404:409);
      throw e;
    }
  }
  async read(hash:string,id:string):Promise<RecoveryRecord>{
    const [row]=await this.run('SELECT yawrd.creation_preparation_recovery_read($1,$2) AS recovery',[hash,id]);
    fail(row?.recovery,'recovery_storage_required',503);return row.recovery as RecoveryRecord;
  }
  async source(hash:string,id:string):Promise<PreparationContext>{
    const [row]=await this.run('SELECT yawrd.creation_preparation_recovery_source($1,$2) AS source',[hash,id]);
    fail(typeof row?.source==='string'&&Buffer.byteLength(row.source)<=24000,'recovery_not_eligible',409);
    const source=JSON.parse(row.source) as PreparationContext;
    fail(source.schema==='creation-prepared-context.v1'&&source.provenance.creationId===id&&source.provenance.creationRevision===7,'recovery_not_eligible',409);
    return source;
  }
  async reserve(hash:string,id:string,attempt:string,parent:string,consent:string,digest:string){
    const [row]=await this.run('SELECT yawrd.creation_preparation_recovery_reserve($1,$2,$3::uuid,$4::uuid,$5,$6) AS won',[hash,id,attempt,parent,consent,digest]);return row?.won===true;
  }
  async stage(hash:string,id:string,attempt:string,state:string,usage:GenerationUsage|null=null,error:string|null=null){
    await this.run('SELECT yawrd.creation_preparation_recovery_stage($1,$2,$3::uuid,$4,$5::jsonb,$6)',[hash,id,attempt,state,usage?JSON.stringify(usage):null,error]);
  }
  async complete(hash:string,id:string,attempt:string,result:GeneratedPreparation){
    await this.run('SELECT yawrd.creation_preparation_recovery_complete($1,$2,$3::uuid,$4,$5::jsonb)',[hash,id,attempt,preparationText(result.artifacts),JSON.stringify(result.usage)]);
  }
}
