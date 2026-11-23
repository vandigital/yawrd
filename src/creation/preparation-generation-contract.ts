import type { PreparationArtifacts, PreparationView } from './preparation-contract.ts';
export const QWEN_MODEL='Qwen/Qwen3.8-27B';
export const PREMIUM_MODEL='openai/gpt-6.1-sol';
export type PreparationModel=typeof QWEN_MODEL|typeof PREMIUM_MODEL;
export const GENERATION_CONSENT='creation-ai-preparation-v1';
export const PREMIUM_CONSENT='creation-partner-preparation-v1';
export const PREPARATION_PROMPT='creation-source-aware-v1';
export const INPUT_BYTES=24000, OUTPUT_TOKENS=8000, PROVIDER_TIMEOUT=180000;
export const RECOVERY_CONSENT='creation-partner-recovery-v1';
export const RECOVERY_PROMPT='creation-source-aware-recovery-v1';
export const RECOVERY_LIMITS={outputTokens:16000,providerTimeoutMs:420000} as const;
export type GenerationLimits={outputTokens:8000|16000;providerTimeoutMs:180000|420000};
export const ORIGINAL_LIMITS:GenerationLimits={outputTokens:OUTPUT_TOKENS,providerTimeoutMs:PROVIDER_TIMEOUT};
export type GenerationState='reserved'|'waiting'|'checking'|'saved'|'failed'|'unknown';
export type GenerationUsage={protocol:'chat-completions'|'responses';requestedModel:PreparationModel;returnedModel:string;
  responseId:string;finishReason:'stop'|'length'|'unknown';tokens:null|{input:number;output:number;reasoning:number|null;cached:number|null};durationMs:number};
export type GenerationAttempt={id:string;state:GenerationState;model:PreparationModel;sourceDigest:string;
  reservedAt:string;dispatchedAt:string|null;responseAt:string|null;finishedAt:string|null;deadlineAt:string;
  errorCode:string|null;resultRevision:number|null;usage:GenerationUsage|null};
export type GenerationView={installed:boolean;canGenerate:boolean;model:PreparationModel;consentVersion:string;partnerProvider:boolean;
  attempt:GenerationAttempt|null;inputBytesLimit:24000;outputTokensLimit:8000|16000;providerTimeoutMs:180000|420000;allowance:1;
  recovery?:{installed:boolean;canRecover:boolean;originalAttempt:GenerationAttempt|null;attempt:GenerationAttempt|null}};
export type GeneratedPreparation={artifacts:PreparationArtifacts|null;usage:GenerationUsage;failure:string|null};
export type GeneratedPreparationView=PreparationView&{generation:GenerationView};
export const activeAttempt=(a:GenerationAttempt|null)=>!!a&&['reserved','waiting','checking'].includes(a.state);

/** Persisted observations only. Deadline expiry is uncertainty, never proof of cancellation. */
export function observedAttempt(a:GenerationAttempt|null,now=Date.now()):GenerationAttempt|null{
  return a&&activeAttempt(a)&&now>Date.parse(a.deadlineAt)?{...a,state:'unknown',errorCode:'generation_completion_unknown'}:a;
}
