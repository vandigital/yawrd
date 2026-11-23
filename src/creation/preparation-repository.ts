import 'server-only';
import { createHash } from 'node:crypto';
import type { Query } from '../participants/database.ts';
import { fail, WorkflowError } from '../participants/repository.ts';
import { projectInput, revisionInput, sessionInput } from './validation.ts';
import { PREPARATION_CONSENT, preparationIssues, validatePreparation, type PreparationArtifacts, type PreparationView } from './preparation-contract.ts';

export const preparationDigest = (text: string) => createHash('sha256').update(text,'utf8').digest('hex');
export function preparationText(value: unknown) { return JSON.stringify(validatePreparation(value)); }
function digestInput(value: unknown): asserts value is string { fail(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'invalid_preparation'); }

/** Trusted-server SQL boundary. No AI-result writer or provider import in P3.5A. */
export class PreparationRepository {
  private readonly query: Query;
  constructor(query: Query) { this.query=query; }
  private async execute(sql: string, args: unknown[]): Promise<PreparationView> {
    try {
      const [row]=await this.query(sql,args);
      fail(row?.workspace,'preparation_storage_required',503);
      const view=structuredClone(row.workspace) as PreparationView;
      fail(view.binding&&view.binding.creationId===args[1]&&Array.isArray(view.versions),'preparation_integrity_error',503);
      let previous=0;
      for(const version of view.versions){
        let content:string;
        try{content=preparationText(version.artifacts);}catch{throw new WorkflowError('preparation_integrity_error',503);}
        fail(Number.isSafeInteger(version.revision)&&version.revision>previous&&
          (version.revision===1?version.parentRevision===null:version.parentRevision===version.revision-1),'preparation_integrity_error',503);
        previous=version.revision;
        fail(preparationDigest(content)===version.digest,'preparation_integrity_error',503);
        const g=version.generation;
        fail((version.origin==='ai-generated'&&g&&g.provider==='near-ai-cloud'&&
          [g.model,g.promptVersion,g.responseId].every(s=>typeof s==='string'&&s.length>0&&s.length<=160)&&
          typeof g.sourceDigest==='string'&&/^[a-f0-9]{64}$/.test(g.sourceDigest)&&version.authorAccountId===null)||
          (version.origin==='founder-edited'&&version.generation===null&&version.authorAccountId===view.binding.founderAccountId&&version.parentRevision!==null), 'preparation_integrity_error',503);
        fail(!version.approval||(version.approval.digest===version.digest&&version.approval.approvedBy===view.binding.founderAccountId&&version.approval.consentVersion===PREPARATION_CONSENT),'preparation_integrity_error',503);
      }
      return {...view,generationEnabled:false};
    } catch(error){
      const e=error as {code?:string;message?:string};
      if(['42P01','42883','42501'].includes(e.code??''))throw new WorkflowError('preparation_storage_required',503);
      const codes=['sign_in_required','creation_not_found','creation_deployment_unverified','preparation_payment_required','preparation_revision_conflict','preparation_binding_conflict','preparation_version_required','preparation_consent_required'];
      if(e.code==='P0001'&&codes.includes(e.message??''))throw new WorkflowError(e.message!,e.message==='sign_in_required'?401:e.message==='creation_not_found'?404:409);
      throw error;
    }
  }
  read(hash:string|null,id:string){
    sessionInput(hash);projectInput(id);
    return this.execute('SELECT yawrd.creation_preparation_read($1,$2) AS workspace',[hash,id]);
  }
  async save(hash:string|null,id:string,expectedRevision:unknown,expectedDigest:unknown,artifacts:unknown){
    sessionInput(hash);projectInput(id);revisionInput(expectedRevision);digestInput(expectedDigest);
    const text=preparationText(artifacts);
    // SQL serializes writes against the same Creation and checks parent digest.
    return this.execute('SELECT yawrd.creation_preparation_save($1,$2,$3,$4,$5) AS workspace',
      [hash,id,expectedRevision,expectedDigest,text]);
  }
  async approve(hash:string|null,id:string,expectedRevision:unknown,expectedDigest:unknown,consent:unknown,consentVersion:unknown){
    sessionInput(hash);projectInput(id);revisionInput(expectedRevision);digestInput(expectedDigest);
    fail(consent===true&&consentVersion===PREPARATION_CONSENT,'preparation_consent_required');
    const view=await this.read(hash,id),current=view.versions.at(-1);
    fail(current&&current.revision===expectedRevision&&current.digest===expectedDigest,'preparation_revision_conflict',409);
    fail(preparationIssues(current.artifacts).length===0,'preparation_incomplete',409);
    return this.execute('SELECT yawrd.creation_preparation_approve($1,$2,$3,$4,$5) AS workspace',
      [hash,id,expectedRevision,expectedDigest,PREPARATION_CONSENT]);
  }
}
export type { PreparationArtifacts };
