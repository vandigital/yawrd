// Offline diagnosis of existing auth stages. No real signing, database or RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authRequest, authSessionRequest, type AuthFailure } from '../src/participants/http.ts';
import { creationAdmissionRequest } from '../src/creation/admission.ts';
import { PersistentAuth } from '../src/participants/auth.ts';
import type { Query } from '../src/participants/database.ts';

const origin='https://yawrd-synthetic-preview.vercel.app';
const request=(path:string,method='GET',address=origin)=>new Request(address+path,{method,
  headers:{host:new URL(address).host,origin:address,...(method==='POST'?{'content-type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify({accountId:'synthetic-founder.testnet',network:'testnet'})}:{})});
const noQuery:Query=async()=>{assert.fail('Signed-out status and origin rejection must not query storage');};
const noRpc=async()=>{assert.fail('No RPC or external transport permitted');};

test('healthy exact-origin signed-out session and admission return signed-out status, not configuration failure',async()=>{
  const session=await authSessionRequest(request('/api/auth/session'),noQuery,origin);
  assert.equal(session.status,200);assert.deepEqual(await session.json(),{accountId:null});
  const admission=await creationAdmissionRequest(request('/api/creations/admission'),noQuery,origin);
  assert.equal(admission.status,200);assert.deepEqual(await admission.json(),{accountId:null,expiresAt:null,admitted:false});
});

test('alternate deployment origin is rejected before challenge storage; missing configured origin is distinct',async()=>{
  for(const [configured,address,status,error,category] of [
    [origin,'https://yawrd-other-deployment.vercel.app',403,'wrong_origin','request_rejected'],
    [null,origin,503,'service_unavailable','origin_configuration_unavailable'],
  ] as const){
    const failures:AuthFailure[]=[];
    const response=await authRequest(request('/api/auth/challenge','POST',address),'challenge',new PersistentAuth(noQuery,noRpc),configured,f=>failures.push(f));
    assert.equal(response.status,status);assert.deepEqual(await response.json(),{error});
    assert.deepEqual(failures,[{stage:'origin',category}]);
  }
});

test('healthy challenge storage preserves the exact intended origin and emits no failure',async()=>{
  let calls=0;const failures:AuthFailure[]=[];
  const response=await authRequest(request('/api/auth/challenge','POST'),'challenge',new PersistentAuth(async()=>{calls++;return [{id:'synthetic'}];},noRpc),origin,f=>failures.push(f));
  const value=await response.json();assert.equal(response.status,200);assert.equal(value.challenge.origin,origin);
  assert.equal(value.challenge.accountId,'synthetic-founder.testnet');assert.equal(calls,1);assert.deepEqual(failures,[]);
});

test('storage failures remain 503 with sanitized stage/category, distinct from origin and admission denial',async()=>{
  for(const code of ['42501','42P01','08006']){
    const failures:AuthFailure[]=[];
    const query:Query=async()=>{throw Object.assign(Error('PRIVATE connection detail'),{code});};
    const response=await authRequest(request('/api/auth/challenge','POST'),'challenge',new PersistentAuth(query,noRpc),origin,f=>failures.push(f));
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'service_unavailable'});
    assert.deepEqual(failures,[{stage:'challenge_storage',category:'database_'+code}]);
    assert.doesNotMatch(JSON.stringify(failures),/PRIVATE/);
  }
});
