import test from 'node:test';
import assert from 'node:assert/strict';
import { creationEnvironment, creationDatabaseUrl, creationActionEnabled } from '../src/creation/release-environment.ts';
import { authorizedDeploymentForEnvironment } from '../src/creation/deployment.ts';
import type { PrivateCreation } from '../src/creation/repository.ts';
import type { DeploymentIntent } from '../src/creation/deployment-types.ts';
import { prepareCreation } from '../src/creation-integration.ts';
import { testnetFactorySettings } from '../src/testnet-factory-settings.ts';
import { generationPolicy, PREMIUM_TEST_BINDING } from '../src/creation/preparation-generation.ts';

type Env=Record<string,string|undefined>;
const preview=():Env=>({NODE_ENV:'production',VERCEL_ENV:'preview',YAWRD_CREATION_ENVIRONMENT:'preview-testnet',YAWRD_ENABLE_CREATION_TESTNET_BETA:'1',
  YAWRD_APP_ORIGIN:'https://yawrd-synthetic-keelbase.vercel.app',YAWRD_CREATION_DATABASE_ENDPOINT:'ep-preview-synthetic',YAWRD_CREATION_PRODUCTION_ENDPOINT:'ep-production-synthetic',
  DATABASE_URL:'postgresql://yawrd_07b_runtime@ep-preview-synthetic.neon.tech/neondb?sslmode=require',YAWRD_CREATION_FOUNDER_ALLOWLIST:'["founder.testnet"]'});
const production=():Env=>({...preview(),VERCEL_ENV:'production',YAWRD_CREATION_ENVIRONMENT:'production-testnet',YAWRD_APP_ORIGIN:'https://yawrd.keelbase.io',
  YAWRD_CREATION_DATABASE_ENDPOINT:'ep-production-synthetic',DATABASE_URL:'postgresql://yawrd_07b_runtime@ep-production-synthetic.neon.tech/neondb?sslmode=require'});

test('explicit Preview and Production modes retain exact origins and environment boundaries',()=>{
  assert.equal(creationEnvironment(preview()),'preview-testnet');assert.equal(creationEnvironment(production()),'production-testnet');
  for(const change of [{YAWRD_ENABLE_CREATION_TESTNET_BETA:undefined},{YAWRD_CREATION_ENVIRONMENT:'mainnet'},{VERCEL_ENV:'production'},
    {NODE_ENV:'development'},{YAWRD_APP_ORIGIN:'http://yawrd-synthetic.vercel.app'},{YAWRD_APP_ORIGIN:'https://yawrd.keelbase.io'},
    {YAWRD_APP_ORIGIN:'https://yawrd-synthetic.vercel.app/path'},{YAWRD_APP_ORIGIN:'https://user:pass@yawrd-synthetic.vercel.app'}])
    assert.equal(creationEnvironment({...preview(),...change}),null,JSON.stringify(change));
  assert.equal(creationEnvironment({...production(),YAWRD_APP_ORIGIN:'https://another.example'}),null);
  assert.equal(creationEnvironment({NODE_ENV:'development'}),'development');
});

test('endpoint/role/TLS pins reject Production from Preview and reject Development from either release',()=>{
  for(const env of [preview(),production()])assert.ok(creationDatabaseUrl(env));
  for(const env of [preview(),production()])for(const change of [
    {YAWRD_CREATION_DATABASE_ENDPOINT:undefined},{YAWRD_CREATION_PRODUCTION_ENDPOINT:undefined},
    {DATABASE_URL:'postgresql://neondb_owner@ep-preview-synthetic.neon.tech/neondb?sslmode=require'},
    {DATABASE_URL:'postgresql://yawrd_07b_runtime@ep-twilight-voice-aorpfrbm.neon.tech/neondb?sslmode=require',YAWRD_CREATION_DATABASE_ENDPOINT:'ep-twilight-voice-aorpfrbm'},
    {DATABASE_URL:'postgresql://yawrd_07b_runtime@ep-preview-synthetic.neon.tech/neondb?sslmode=disable'},
    {DATABASE_URL:'postgresql://yawrd_07b_runtime@ep-preview-synthetic.example/neondb?sslmode=require'},
    {YAWRD_DATABASE_URL:'postgresql://different.example/other'}])assert.throws(()=>creationDatabaseUrl({...env,...change}));
  assert.throws(()=>creationDatabaseUrl({...preview(),DATABASE_URL:production().DATABASE_URL,YAWRD_CREATION_DATABASE_ENDPOINT:'ep-production-synthetic'}));
  assert.throws(()=>creationDatabaseUrl({...production(),DATABASE_URL:preview().DATABASE_URL,YAWRD_CREATION_DATABASE_ENDPOINT:'ep-preview-synthetic'}));
  assert.throws(()=>creationDatabaseUrl({NODE_ENV:'production'}));
});

test('admission and runtime opt-in do not grant any action permission',()=>{
  const keys={deployment:'YAWRD_ENABLE_CREATION_DEPLOYMENT',hardening:'YAWRD_ENABLE_CREATION_HARDENING',fee:'YAWRD_ENABLE_CREATION_PLATFORM_FEE_PAYMENT',generation:'YAWRD_ENABLE_CREATION_PREPARATION',publication:'YAWRD_ENABLE_CREATION_PUBLICATION'} as const;
  for(const env of [preview(),production()])for(const [action,key] of Object.entries(keys)){
    assert.equal(creationActionEnabled(action as keyof typeof keys,env),false);
    const enabled={...env,[key]:'1'};assert.equal(creationActionEnabled(action as keyof typeof keys,enabled),true);
    assert.equal(creationActionEnabled(action as keyof typeof keys,{...enabled,YAWRD_ENABLE_CREATION_TESTNET_BETA:undefined}),false);
    for(const other of Object.keys(keys))if(other!==action)assert.equal(creationActionEnabled(other as keyof typeof keys,enabled),false);
  }
});

test('release deployment only permits a current owner-bound fresh first attempt, never Development retry pins',()=>{
  const p=prepareCreation({projectName:'Synthetic release',projectPurpose:'Bounded review',projectAccountLabel:'a1b2c3d4e5f6',creatorAccountId:'founder.testnet',initialStewardAccountIds:['second.testnet'],stewardApprovalThreshold:2,factoryAccountId:'factory.yawrd.testnet'},testnetFactorySettings,{accountId:'founder.testnet',network:'testnet'});
  const c={id:'yawrd-aaaaaaaaaaaa',network:'testnet',founderAccountId:'founder.testnet',revision:2,configuration:{publicName:'Synthetic release',publicDescription:'Bounded review',accountLabel:'',secondSteward:'second.testnet',threshold:2}} as PrivateCreation;
  const i={creationId:c.id,network:'testnet',factoryAccountId:'factory.yawrd.testnet',identifier:'a1b2c3d4e5f6',daoAccountId:p.plan.daoAccountId,sourceRevision:2,state:'prepared',prepared:p,attempt:0,transactionHash:null,lastEvidence:null,evidenceAttempt:null,costs:{}} as DeploymentIntent;
  const env={...production(),YAWRD_ENABLE_CREATION_DEPLOYMENT:'1'};
  assert.equal(authorizedDeploymentForEnvironment(c,i,env),true);
  for(const patch of [{attempt:1},{state:'unknown'},{transactionHash:'X'.repeat(43)},{sourceRevision:1},{creationId:'yawrd-bbbbbbbbbbbb'},{network:'mainnet'},
    {lastEvidence:{}},{evidenceAttempt:1},{costs:{retiredAttempts:[{}]}},{prepared:{...p,input:{...p.input,creatorAccountId:'other.testnet'}}}])
    assert.equal(authorizedDeploymentForEnvironment(c,{...i,...patch} as DeploymentIntent,env),false,JSON.stringify(patch));
  assert.equal(authorizedDeploymentForEnvironment(c,i,production()),false);
  assert.equal(authorizedDeploymentForEnvironment({...c,founderAccountId:'other.testnet'},i,env),false);
  assert.equal(authorizedDeploymentForEnvironment(c,i,{...env,YAWRD_CREATION_DATABASE_ENDPOINT:'ep-wrong'}),false);
});

test('release generation requires its own flag and never carries the premium Development exception',()=>{
  const binding={...PREMIUM_TEST_BINDING} as Parameters<typeof generationPolicy>[0];
  assert.equal(generationPolicy(binding,production()).enabled,false);
  const enabled={...production(),YAWRD_ENABLE_CREATION_PREPARATION:'1'};
  assert.equal(generationPolicy(binding,enabled).enabled,true);
  assert.equal(generationPolicy(binding,{...enabled,YAWRD_ENABLE_CREATION_PREMIUM_TEST:'1'}).enabled,false);
});
