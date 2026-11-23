import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generateDaoIdentifier, previewDaoIdentifier } from '../src/creation/dao-identifier.ts';
import { prepareSavedCreation, inspectSavedCreationTransaction, savedCreationInput } from '../src/creation/deployment.ts';
import { creationDeploymentRequest } from '../src/creation/deployment-http.ts';
import { RpcError, createTestnetRpc, prepareCreation, type FactorySettings, type Rpc } from '../src/creation-integration.ts';
import { testnetFactorySettings, creationSubmissionAuthorized, authorizedCreationDeployment } from '../src/testnet-factory-settings.ts';
import { createEmptyYawrdIntakeDraft } from '../src/yawrd-intake.ts';
import { hashToken, SESSION_COOKIE } from '../src/participants/auth.ts';
import { authSessionRequest } from '../src/participants/http.ts';
import type { PrivateCreation } from '../src/creation/repository.ts';
import { CreationRepository } from '../src/creation/repository.ts';
import { DEPLOYMENT_CONSENT, type DeploymentIntent, type DeploymentView } from '../src/creation/deployment-types.ts';
import { submitDeployment } from '../app/create/setup/deployment-submit.ts';
import { prepareDurableDeployment, beginDurableDeployment, reconcileDurableDeployment, authorizedDevelopmentDeployment, authorizedDevelopmentRecovery, retireUnsubmittedDeployment } from '../src/creation/deployment.ts';
import type { Query } from '../src/participants/database.ts';

const identifier = 'a1b2c3d4e5f6', txHash = 'T'.repeat(43), blockHash = 'B'.repeat(43), token = 'a'.repeat(43);
const now = '2026-11-18T00:00:00.000Z';
const creation: PrivateCreation = { id: 'yawrd-aaaaaaaaaaaa', network: 'testnet', founderAccountId: 'founder.testnet', sourceDraftId: 'source', revision: 3,
  initialIntake: createEmptyYawrdIntakeDraft('source', now), intake: createEmptyYawrdIntakeDraft('source', now),
  configuration: { publicName: 'Public garden', publicDescription: 'Separate public description', accountLabel: 'historical-label', secondSteward: 'neighbor.testnet', threshold: 2 },
  publicTextDigest: 'a'.repeat(64), publicTextReview: null, createdAt: now, updatedAt: now };
creation.intake.answers.founderDescription = 'PRIVATE INTAKE NEVER DEPLOYED';
function codeHash(text: string) {
  const bytes = createHash('sha256').update(text).digest(); let value = BigInt('0x' + bytes.toString('hex')), result = '';
  while (value) { result = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(value % BigInt(58))] + result; value /= BigInt(58); }
  return result;
}
// Synthetic contract bytes only. The actual reviewed public settings are tested
// separately; mocked evidence is never claimed to be a live deployment.
const settings: FactorySettings = { ...testnetFactorySettings, expectedFactoryCodeHash: codeHash('factory'), expectedDaoCodeHash: codeHash('dao') };
function fixture() {
  let p = prepareCreation(savedCreationInput(creation, identifier), settings, { accountId: creation.founderAccountId, network: 'testnet' });
  let exists = false, autoUpdate = true, reverse = false, gasPrice = '100000000', finalHeight = 200;
  const calls: string[] = [];
  const outcome = (id: string, executor_id: string, receipt_ids: string[], status: object) => ({ id, block_hash: blockHash, outcome: { executor_id, receipt_ids, status } });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
  const final = () => ({ final_execution_status: 'FINAL', status: { SuccessValue: '' },
    transaction: { hash: txHash, signer_id: p.transaction.signerId, receiver_id: p.transaction.receiverId,
      actions: [{ FunctionCall: { method_name: 'create', gas: settings.createGas, deposit: settings.setupDepositYocto, args: encode(p.transaction.actions[0].params.args) } }] },
    transaction_outcome: outcome(txHash, p.transaction.signerId, ['f'.repeat(43)], { SuccessReceiptId: 'f'.repeat(43) }),
    receipts: [
      { receipt_id: 'd'.repeat(43), predecessor_id: settings.factoryAccountId, receiver_id: p.plan.daoAccountId, receipt: { Action: { actions: ['CreateAccount', { FunctionCall: { method_name: 'new', args: encode(p.plan.initializer) } }] } } },
      { receipt_id: 'c'.repeat(43), predecessor_id: settings.factoryAccountId, receiver_id: settings.factoryAccountId, receipt: { Action: { actions: [{ FunctionCall: { method_name: 'on_create', args: encode({ account_id: p.plan.daoAccountId, attached_deposit: settings.setupDepositYocto, predecessor_account_id: p.transaction.signerId }) } }] } } },
    ],
    receipts_outcome: [outcome('f'.repeat(43), settings.factoryAccountId, ['d'.repeat(43), 'c'.repeat(43)], { SuccessReceiptId: 'd'.repeat(43) }), outcome('d'.repeat(43), p.plan.daoAccountId, [], { SuccessValue: '' }), outcome('c'.repeat(43), settings.factoryAccountId, [], { SuccessValue: 'dHJ1ZQ==' })],
  });
  let evidence: any = final();
  const rpc: Rpc = async (method, params) => {
    calls.push(method);
    if (method === 'status') return { chain_id: 'testnet' };
    if (method === 'block') return { header: { hash: params.block_id ?? 'F'.repeat(43), height: params.block_id ? 100 : finalHeight, gas_price: gasPrice } };
    if (method === 'EXPERIMENTAL_tx_status') return structuredClone(evidence);
    assert.equal(method, 'query');
    if (params.request_type === 'view_account') {
      if (params.account_id === p.plan.daoAccountId && !exists) throw new RpcError({ cause: { name: 'UNKNOWN_ACCOUNT' } });
      return {};
    }
    if (params.request_type === 'view_code') return { code_base64: Buffer.from(params.account_id === settings.factoryAccountId ? 'factory' : 'dao').toString('base64') };
    if (params.request_type === 'view_global_contract_code') return { code_base64: Buffer.from('dao').toString('base64') };
    if (params.method_name === 'get_code') return { result: [...Buffer.from('dao')] };
    const policy = structuredClone(p.plan.initializer.policy);
    if (reverse) { policy.roles[0].kind.Group.reverse(); policy.roles[0].permissions.reverse(); }
    const views: Record<string, unknown> = { get_default_code_hash: settings.expectedDaoCodeHash,
      get_config: p.plan.initializer.config, get_policy: policy, get_factory_info: { factory_id: settings.factoryAccountId, auto_update: autoUpdate }, get_dao_list: exists ? [p.plan.daoAccountId] : [] };
    assert.ok(Object.hasOwn(views, String(params.method_name)));
    return { result: [...Buffer.from(JSON.stringify(views[String(params.method_name)]))] };
  };
  return { rpc, calls, p, setPrepared:(value:ReturnType<typeof prepareCreation>)=>{p=value;evidence=final();}, setFinalHeight:(v:number)=>{finalHeight=v;}, setExists: (v: boolean) => { exists = v; }, setAuto: (v: boolean) => { autoUpdate = v; }, setReverse: () => { reverse = true; }, setPrice: (v: string) => { gasPrice = v; }, setEvidence: (v: any) => { evidence = v; }, final };
}

test('approved settings match the supplied 10B record and cannot authorize signing', () => {
  assert.equal(testnetFactorySettings.factoryAccountId, 'factory.yawrd.testnet');
  assert.equal(testnetFactorySettings.expectedFactoryCodeHash, '4mU84bSMfnJ8d7eEvf1jTwXTn5opVE4HGBWpxz9AB65d');
  assert.equal(testnetFactorySettings.expectedDaoCodeHash, '7mSUs75fYMFsUmjXGFLMy7b2LQ7gA1ojW3woSoAUQmzt');
  assert.equal(testnetFactorySettings.setupDepositYocto, '1000000000000000000000000');
  assert.equal(testnetFactorySettings.createGas, '300000000000000');
  assert.equal(creationSubmissionAuthorized, false);
});
test('DAO identifier uses every allowed symbol and rejects biased bytes, malformed and broken entropy', () => {
  assert.equal(generateDaoIdentifier(bytes => { bytes.fill(255); for (let i=0;i<12;i++) bytes[i]=i; return bytes; }), 'abcdefghijkl');
  assert.equal(generateDaoIdentifier(bytes => { for (let i=0;i<24;i++) bytes[i]=i+24; return bytes; }), 'yz0123456789');
  let batches = 0;
  assert.equal(generateDaoIdentifier(bytes => { bytes.fill(++batches === 1 ? 252 : 251); return bytes; }), '9'.repeat(12));
  assert.throws(() => generateDaoIdentifier(() => new Uint8Array(1)), /invalid_random/);
  assert.throws(() => generateDaoIdentifier(bytes => bytes.fill(255)), /exhausted/);
  assert.match(generateDaoIdentifier(), /^[a-z0-9]{12}$/);
});
test('preview identity survives retries and reloads, stays founder/draft scoped and fails closed on corrupt storage', () => {
  const values = new Map<string, string>();
  const store = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k,v); } };
  const a = previewDaoIdentifier(store, creation.founderAccountId, creation.id);
  assert.equal(previewDaoIdentifier(store, creation.founderAccountId, creation.id), a);
  previewDaoIdentifier(store, 'other.testnet', creation.id); assert.equal(values.size, 2);
  values.set([...values.keys()][0], 'CORRUPT');
  assert.throws(() => previewDaoIdentifier(store, creation.founderAccountId, creation.id), /unreadable/);
  assert.equal(values.get([...values.keys()][0]), 'CORRUPT');
});
test('saved public configuration prepares the reviewed factory call without reusing old labels or private intake', async () => {
  const f = fixture(), before = structuredClone(creation);
  const preview = await prepareSavedCreation(creation, 3, identifier, settings, f.rpc);
  assert.equal(preview.daoAccountId, identifier + '.factory.yawrd.testnet');
  assert.equal(preview.prepared.transaction.actions[0].params.args.name, identifier);
  assert.deepEqual(preview.prepared.plan.initializer.policy.roles[0].kind.Group, ['founder.testnet','neighbor.testnet']);
  assert.deepEqual(preview.prepared.plan.initializer.policy.default_vote_policy, { weight_kind: 'RoleWeight', quorum: '2', threshold: '2' });
  assert.equal(preview.costs.attachedGasAtObservedPriceYocto, '30000000000000000000000');
  assert.equal(preview.submissionEnabled, false); assert.equal(preview.deploymentRecorded, false);
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE INTAKE|historical-label/);
  assert.deepEqual(creation, before); assert.ok(f.calls.every(m => ['block','query','status'].includes(m)));
  for (const invalid of ['project-name','A'.repeat(12),'a'.repeat(11),'a'.repeat(13)]) assert.throws(() => savedCreationInput(creation, invalid), /invalid_dao_identifier/);
  await assert.rejects(prepareSavedCreation(creation, 2, identifier, settings, f.rpc), /creation_revision_conflict/);
  await assert.rejects(prepareSavedCreation({ ...creation, configuration: { ...creation.configuration, secondSteward: creation.founderAccountId } }, 3, identifier, settings, f.rpc), /invalid_creation_configuration/);
});
test('known collision, RPC uncertainty and invalid price cannot rotate identifiers or prepare a wallet submission', async () => {
  const f = fixture(); f.setExists(true);
  await assert.rejects(prepareSavedCreation(creation,3,identifier,settings,f.rpc), /dao_account_collision/);
  await assert.rejects(prepareSavedCreation(creation,3,identifier,settings,async () => { throw new Error('unknown network'); }), /unknown network/);
  f.setExists(false);f.setPrice('invalid');
  await assert.rejects(prepareSavedCreation(creation,3,identifier,settings,f.rpc), /deployment_quote_unavailable/);
  assert.equal(creation.configuration.accountLabel, 'historical-label');
});
test('server receipt reconciliation accepts 10B policy-set ordering but never activates funding, publication or durable deployment', async () => {
  const f=fixture();f.setExists(true);f.setReverse();
  for (const auto of [true,false]) {
    f.setAuto(auto);
    const observed=await inspectSavedCreationTransaction(creation,3,identifier,txHash,settings,f.rpc);
    assert.equal(observed.phase,'verified-unrecorded');
    assert.equal(observed.deploymentRecorded,false);assert.equal(observed.fundingEnabled,false);assert.equal(observed.publicationEnabled,false);
    assert.ok('hardening' in observed && observed.hardening==='required');
  }
  const fake=f.final();fake.receipts_outcome=[];f.setEvidence(fake);
  await assert.rejects(inspectSavedCreationTransaction(creation,3,identifier,txHash,settings,f.rpc), /incomplete|verified/);
  f.setEvidence({transaction:{hash:txHash},status:{SuccessValue:''},final_execution_status:'FINAL'});
  await assert.rejects(inspectSavedCreationTransaction(creation,3,identifier,txHash,settings,f.rpc), /does not match/);
});

/** Behavioral SQL-function double, not a PostgreSQL proof. It exercises the real
 * repository/service/HTTP/submit code. Proposal invariants are checked separately;
 * installation/lock behavior remain an explicitly authorized live check.
 */
function durableHarness() {
  const f=fixture(), source=structuredClone(creation);
  const intents=new Map<string,Record<string,any>>(),calls:{sql:string;args:unknown[]}[]=[];
  let collisionBudget=0,loseReserve=false,revoked=false,recoveryInstalled=false,clock=0,transport:Rpc=f.rpc;
  const fail=(code:string):never=>{throw Object.assign(new Error(code),{code:'P0001'});};
  const ownerHash=hashToken(token),secondHash=hashToken('c'.repeat(43));
  const current=()=>({id:source.id,founder_account_id:source.founderAccountId,source_draft_id:source.sourceDraftId,revision:source.revision,
    initial_intake:source.initialIntake,intake:source.intake,public_name:source.configuration.publicName,public_description:source.configuration.publicDescription,
    account_label:source.configuration.accountLabel,second_steward:source.configuration.secondSteward,public_text_digest:source.publicTextDigest,
    reviewed_revision:null,created_at:now,updated_at:now});
  function bump(row:Record<string,any>) {row.revision++;row.updated_at=now;return [structuredClone(row)];}
  const query:Query=async(sql,args=[])=>{
    calls.push({sql,args:structuredClone(args)});
    if(revoked)fail('sign_in_required');
    if(![ownerHash,secondHash].includes(String(args[0])))fail('creation_not_found');
    if(args[1]!==source.id)fail('creation_not_found');
    if(sql.includes('yawrd.creation_read('))return [structuredClone(current())];
    assert.match(sql,/^SELECT \* FROM yawrd\.creation_deployment_/);
    if(sql.includes('deployment_read'))return intents.has(source.id)?[structuredClone(intents.get(source.id)!)]:[];
    const row=intents.get(source.id);
    if(sql.includes('deployment_reserve')){
      if(args[2]!==source.revision)fail('creation_revision_conflict');
      if(row)return [structuredClone(row)];
      if(collisionBudget-->0)return [];
      const r={creation_id:source.id,network:'testnet',factory_account_id:settings.factoryAccountId,dao_identifier:args[3],dao_account_id:args[3]+'.'+settings.factoryAccountId,
        source_revision:source.revision,revision:1,state:'reserved',prepared:null,request_digest:null,costs:null,prepared_at:null,
        attempt:0,claimed_at:null,not_before_height:null,transaction_hash:null,verified_transaction_hash:null,evidence:null,evidence_attempt:null,created_at:now,updated_at:now};
      intents.set(source.id,r);
      f.setPrepared(prepareCreation(savedCreationInput(source,String(args[3])),settings,{accountId:source.founderAccountId,network:'testnet'}));
      if(loseReserve){loseReserve=false;throw new Error('uncertain_commit');}
      return [structuredClone(r)];
    }
    if(!row)return fail('deployment_not_found');
    if(sql.includes('deployment_prepare')||sql.includes('deployment_claim')){
      if(args[2]!==source.revision)fail('creation_revision_conflict');
      if(args[3]!==row.revision)fail('deployment_revision_conflict');
    }else if(args[2]!==row.revision||args[3]!==row.attempt)fail('deployment_revision_conflict');
    if(sql.includes('deployment_prepare')){
      const costs=JSON.parse(String(args[5]));
      const retiring=recoveryInstalled&&['wallet-requested','unknown'].includes(row.state)&&Array.isArray(costs.retiredAttempts);
      if(!['reserved','prepared','failed'].includes(row.state)&&!retiring)fail('deployment_unresolved');
      if(retiring&&(row.transaction_hash||row.evidence))fail('deployment_recovery_evidence_required');
      if(!retiring&&row.costs?.retiredAttempts)costs.retiredAttempts=structuredClone(row.costs.retiredAttempts);
      const prepared=JSON.parse(String(args[4]));
      if(row.attempt>0&&JSON.stringify(prepared)!==JSON.stringify(row.prepared))fail('deployment_identity_frozen');
      if(row.attempt===0)row.source_revision=source.revision;
      Object.assign(row,{prepared,costs,prepared_at:now,prepared_clock:clock,state:'prepared',request_digest:createHash('sha256').update(JSON.stringify(prepared)).digest('hex')});
      return bump(row);
    }
    if(sql.includes('deployment_claim')){
      if(row.state!=='prepared')fail('deployment_unresolved');
      if(clock-row.prepared_clock>=300000)fail('deployment_review_expired');
      if(args[5]!==DEPLOYMENT_CONSENT)fail('deployment_consent_required');
      if((row.not_before_height&&BigInt(String(args[4]))<BigInt(row.not_before_height))||(row.evidence&&BigInt(String(args[4]))<BigInt(row.evidence.finalHeight)))fail('deployment_head_regressed');
      if(row.prepared.input.projectName!==source.configuration.publicName||row.prepared.input.secondSteward===source.founderAccountId)fail('deployment_request_mismatch');
      Object.assign(row,{state:'wallet-requested',attempt:row.attempt+1,claimed_at:now,not_before_height:String(args[4]),transaction_hash:null});
      return bump(row);
    }
    if(!['wallet-requested','unknown'].includes(row.state))fail('deployment_unresolved');
    if(sql.includes('deployment_note')){
      if(row.state==='unknown'&&(args[4]===null||args[4]===row.transaction_hash))return [structuredClone(row)];
      row.state='unknown';if(args[4]!==null)row.transaction_hash=args[4];return bump(row);
    }
    assert.match(sql,/deployment_finish/);
    const evidence=JSON.parse(String(args[5]));
    if(evidence.transactionHash!==row.transaction_hash||BigInt(evidence.transactionBlockHeight)<=BigInt(row.not_before_height))fail('deployment_evidence_required');
    Object.assign(row,{state:args[4],evidence,evidence_attempt:row.attempt,verified_transaction_hash:evidence.transactionHash});
    return bump(row);
  };
  async function send(data?:object,authorized:Parameters<typeof creationDeploymentRequest>[6]=false,requestToken=token,account=source.founderAccountId){
    return creationDeploymentRequest(new Request('https://yawrd.example/api/creations/'+source.id+'/deployment',{
      method:data?'POST':'GET',headers:{host:'yawrd.example',origin:'https://yawrd.example','content-type':'application/json',cookie:SESSION_COOKIE+'='+requestToken,'x-yawrd-account':account},
      ...(data?{body:JSON.stringify(data)}:{}),
    }),source.id,query,'https://yawrd.example',settings,transport,authorized);
  }
  const request=async(data:object)=>{const response=await send(data,true);const body=await response.json();if(!response.ok)throw new Error(body.error);return body as DeploymentView;};
  return {f,source,intents,calls,query,send,request,repo:new CreationRepository(query),hash:ownerHash,
    installRecovery:()=>{recoveryInstalled=true;},collisions:(n:number)=>{collisionBudget=n;},lose:()=>{loseReserve=true;},revoke:()=>{revoked=true;},tick:(n:number)=>{clock+=n;},
    rpc:(v:Rpc)=>{transport=v;},get transport(){return transport;}};
}
async function ready(h:ReturnType<typeof durableHarness>){
  const v=await prepareDurableDeployment(h.repo,h.hash,creation.id,h.source.revision,settings,h.transport,true);
  assert.ok(v.intent?.prepared);return v.intent;
}
async function claim(h:ReturnType<typeof durableHarness>,intent:DeploymentIntent){
  h.f.setFinalHeight(90);
  const v=await beginDurableDeployment(h.repo,h.hash,creation.id,h.source.revision,intent.revision,settings,h.transport,true);
  h.f.setFinalHeight(200);assert.ok(v.intent);return v.intent;
}
test('one reservation survives new repositories/sessions, known collisions, and lost responses',async()=>{
  const h=durableHarness();h.collisions(1);h.lose();
  await assert.rejects(h.repo.reserveDeployment(h.hash,creation.id,3),/uncertain_commit/);
  const saved=[...h.intents.values()][0],id=saved.dao_identifier;
  const resumed=await new CreationRepository(h.query).reserveDeployment(hashToken('c'.repeat(43)),creation.id,3);
  assert.equal(resumed.identifier,id);assert.match(id,/^[a-z0-9]{12}$/);
  assert.equal(h.calls.filter(c=>c.sql.includes('deployment_reserve')).length,2);
  assert.equal(h.intents.size,1);
});
test('durable preparation uses the chosen display name and preserves identity when refreshing a draft',async()=>{
  const h=durableHarness();h.source.configuration.publicName='testtest';
  const a=await ready(h);assert.equal(a.prepared!.plan.initializer.config.name,'testtest');assert.notEqual(a.identifier,'testtest');
  h.source.configuration.publicName='Another display name';h.source.revision++;
  const b=await ready(h);assert.equal(b.identifier,a.identifier);assert.equal(b.prepared!.plan.initializer.config.name,'Another display name');
  assert.equal(h.source.configuration.accountLabel,'historical-label');
});
test('two concurrent signing claims have one winner and stale revisions cannot request another signature',async()=>{
  const h=durableHarness(),a=await ready(h);h.f.setFinalHeight(90);
  const result=await Promise.allSettled([beginDurableDeployment(h.repo,h.hash,creation.id,3,a.revision,settings,h.transport,true),beginDurableDeployment(h.repo,h.hash,creation.id,3,a.revision,settings,h.transport,true)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  const row=h.intents.get(creation.id)!;assert.equal(row.state,'wallet-requested');assert.equal(row.attempt,1);
  await assert.rejects(beginDurableDeployment(h.repo,h.hash,creation.id,3,a.revision,settings,h.transport,true),/revision|unresolved/);
  const existing=await ready(h);assert.equal(existing.state,'wallet-requested');assert.equal(existing.identifier,a.identifier);
});
test('wallet submission occurs only after durable claim and finalized server verification records a gated deployment',async()=>{
  const h=durableHarness(),a=await ready(h);h.f.setFinalHeight(90);let signatures=0;
  const result=await submitDeployment({creationRevision:3,founder:creation.founderAccountId,reviewed:a,request:h.request,
    getWallet:()=>({accountId:creation.founderAccountId,network:'testnet'}),sign:async transaction=>{
      signatures++;assert.equal(h.intents.get(creation.id)!.state,'wallet-requested');assert.deepEqual(transaction,a.prepared!.transaction);
      h.f.setExists(true);h.f.setFinalHeight(200);return {transaction:{hash:txHash}};
    }});
  assert.equal(signatures,1);assert.equal(result.intent!.state,'deployed-hardening-required');
  assert.equal(result.deploymentRecorded,true);assert.equal(result.fundingEnabled,false);assert.equal(result.publicationEnabled,false);assert.equal(result.platformFeesEnabled,false);
  assert.equal(result.intent!.lastEvidence!.transactionHash,txHash);
  // Verification response loss is recovered from the durable row, with no signing.
  const read=await (await h.send()).json();assert.equal(read.intent.identifier,a.identifier);assert.equal(read.deploymentRecorded,true);
  const again=await reconcileDurableDeployment(new CreationRepository(h.query),h.hash,creation.id,a.revision,1,txHash,h.transport);
  assert.equal(again.intent!.state,'deployed-hardening-required');
});
test('simulated wallet success without matching finalized server evidence cannot record deployment',async()=>{
  for(const outcome of [{status:'success',confirmed:true},{transaction:{hash:'Z'.repeat(43)},status:'success'}]){
    const h=durableHarness(),a=await ready(h);h.f.setFinalHeight(90);
    const work=submitDeployment({creationRevision:3,founder:creation.founderAccountId,reviewed:a,request:h.request,
      getWallet:()=>({accountId:creation.founderAccountId,network:'testnet'}),sign:async()=>outcome});
    if('transaction' in outcome)await assert.rejects(work,/service_unavailable/);else await work;
    const row=h.intents.get(creation.id)!;assert.equal(row.state,'unknown');assert.equal(row.evidence,null);
    assert.equal((await (await h.send()).json()).deploymentRecorded,false);
  }
});
test('lost claim responses and explicit wallet rejection keep an unresolved identity without automatic retries',async()=>{
  const h=durableHarness(),a=await ready(h);h.f.setFinalHeight(90);let signatures=0;
  await assert.rejects(submitDeployment({creationRevision:3,founder:creation.founderAccountId,reviewed:a,
    request:async data=>{await h.request(data);throw new Error('lost claim response');},getWallet:()=>({accountId:creation.founderAccountId,network:'testnet'}),sign:async()=>{signatures++;}}),/lost claim/);
  assert.equal(signatures,0);assert.equal(h.intents.get(creation.id)!.state,'wallet-requested');
  const k=durableHarness(),b=await ready(k);k.f.setFinalHeight(90);
  await assert.rejects(submitDeployment({creationRevision:3,founder:creation.founderAccountId,reviewed:b,request:k.request,
    getWallet:()=>({accountId:creation.founderAccountId,network:'testnet'}),sign:async()=>{throw Object.assign(new Error('User rejected'),{code:4001});}}),/User rejected/);
  const row=k.intents.get(creation.id)!;assert.equal(row.state,'unknown');assert.equal(row.dao_identifier,b.identifier);
  await assert.rejects(beginDurableDeployment(k.repo,k.hash,creation.id,3,row.revision,settings,k.transport,true),/deployment_unresolved/);
});
test('RPC interruption preserves the transaction reference and reconciliation uses the frozen request after draft edits',async()=>{
  const h=durableHarness(),a=await ready(h),b=await claim(h,a);h.f.setExists(true);
  const timeout:Rpc=async(m,p)=>{if(m==='EXPERIMENTAL_tx_status')throw new Error('synthetic timeout');return h.f.rpc(m,p);};
  await assert.rejects(reconcileDurableDeployment(h.repo,h.hash,creation.id,b.revision,b.attempt,txHash,timeout),/timeout/);
  const row=h.intents.get(creation.id)!;assert.equal(row.state,'unknown');assert.equal(row.transaction_hash,txHash);
  h.source.configuration.publicName='Edited after wallet request';h.source.revision++;
  const result=await reconcileDurableDeployment(h.repo,h.hash,creation.id,row.revision,row.attempt,txHash,h.f.rpc);
  assert.equal(result.intent!.state,'deployed-hardening-required');assert.equal(result.intent!.prepared!.input.projectName,creation.configuration.publicName);
});
test('only finalized failed evidence allows re-preparation; old failed hashes cannot unlock a later attempt',async()=>{
  const h=durableHarness(),a=await ready(h),b=await claim(h,a);
  const failed:any=h.f.final();failed.status={Failure:{error:'synthetic failure'}};h.f.setEvidence(failed);
  const result=await reconcileDurableDeployment(h.repo,h.hash,creation.id,b.revision,b.attempt,txHash,h.f.rpc);
  assert.equal(result.intent!.state,'failed');
  const retried=await ready(h);assert.equal(retried.identifier,a.identifier);
  h.f.setFinalHeight(90);
  await assert.rejects(beginDurableDeployment(h.repo,h.hash,creation.id,3,retried.revision,settings,h.f.rpc,true),/deployment_head_regressed/);
  // Second attempt's finalized head is newer than the previous failed inclusion.
  h.f.setFinalHeight(200);
  const claimed=await beginDurableDeployment(h.repo,h.hash,creation.id,3,retried.revision,settings,h.f.rpc,true);
  await assert.rejects(reconcileDurableDeployment(h.repo,h.hash,creation.id,claimed.intent!.revision,2,txHash,h.f.rpc),/deployment_predates_attempt/);
  assert.equal(h.intents.get(creation.id)!.state,'unknown');
});
test('revocation or a concurrent reference update during RPC prevents evidence commit',async()=>{
  for(const revoke of [true,false]){
    const h=durableHarness(),a=await ready(h),b=await claim(h,a);h.f.setExists(true);let changed=false;
    const rpc:Rpc=async(method,params)=>{
      const value=await h.f.rpc(method,params);
      if(!changed&&params.method_name==='get_factory_info'){
        changed=true;
        if(revoke)h.revoke();
        else{const row=h.intents.get(creation.id)!;await h.repo.noteDeployment(h.hash,creation.id,row.revision,row.attempt,'R'.repeat(43));}
      }
      return value;
    };
    await assert.rejects(reconcileDurableDeployment(h.repo,h.hash,creation.id,b.revision,b.attempt,txHash,rpc),revoke?/sign_in_required/:/deployment_revision_conflict/);
    const row=h.intents.get(creation.id)!;assert.equal(row.state,'unknown');assert.equal(row.evidence,null);
  }
});
test('stale project revisions, expired reviews, cross-founder access, and revoked sessions fail without activation',async()=>{
  const h=durableHarness(),a=await ready(h);
  h.source.revision++;
  await assert.rejects(beginDurableDeployment(h.repo,h.hash,creation.id,3,a.revision,settings,h.f.rpc,true),/creation_revision_conflict/);
  h.source.revision=3;h.tick(300000);
  await assert.rejects(beginDurableDeployment(h.repo,h.hash,creation.id,3,a.revision,settings,h.f.rpc,true),/deployment_review_expired/);
  assert.equal((await h.send(undefined,false,'b'.repeat(43),'other.testnet')).status,404);
  h.revoke();await assert.rejects(h.repo.deployment(h.hash,creation.id),/sign_in_required/);
});
test('HTTP does not accept client identities, receipts or activation flags; production claim gate stays closed',async()=>{
  const h=durableHarness(),data={action:'prepare',expectedRevision:3};
  assert.equal((await h.send(data)).status,200);const d=await h.repo.deployment(h.hash,creation.id);assert.ok(d);
  for(const extra of [{identifier:'a'.repeat(12)},{confirmed:true},{prepared:{}},{founderAccountId:'other.testnet'},{walletResult:{status:'success'}},{submissionEnabled:true}])assert.equal((await h.send({...data,...extra})).status,400);
  assert.equal((await h.send({...data,action:'submit'})).status,400);
  assert.equal((await h.send({action:'begin',expectedRevision:3,intentRevision:d.revision,consent:true,consentVersion:DEPLOYMENT_CONSENT})).status,403);
  assert.equal(h.intents.get(creation.id)!.attempt,0);
  const missing:Query=async()=>{throw Object.assign(new Error('missing private relation'),{code:'42P01'});};
  await assert.rejects(new CreationRepository(missing).deployment(h.hash,creation.id),/deployment_storage_unavailable/);
});
test('one unapplied private SQL table provides identity uniqueness, CAS, ownership locks and frozen evidence boundaries',async()=>{
  const sql=await readFile(new URL('../docs/proposals/migrations/phase2_creation_deployment_intents.sql',import.meta.url),'utf8');
  assert.deepEqual([...sql.matchAll(/CREATE TABLE ([a-z_.]+)/g)].map(m=>m[1]),['yawrd.creation_deployments']);
  assert.match(sql,/PRIMARY KEY REFERENCES yawrd\.creation_drafts/);assert.match(sql,/UNIQUE \(network, factory_account_id, dao_identifier\)/);
  assert.match(sql,/\^\[a-z0-9\]\{12\}\$/);assert.match(sql,/OLD\.attempt > 0/);assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/PERFORM yawrd\.creation_founder\(_session\)/);assert.match(sql,/deployment_revision_conflict/);
  assert.match(sql,/wallet-requested/);assert.match(sql,/interval '5 minutes'/);assert.match(sql,/d\.not_before_height/);assert.match(sql,/deployment_head_regressed/);
  assert.doesNotMatch(sql,/^GRANT |SECURITY DEFINER|ALTER TABLE|yawrd\.projects/m);
  for(const name of [...sql.matchAll(/CREATE FUNCTION yawrd\.(\w+)/g)].map(m=>m[1]))assert.ok(sql.includes('REVOKE ALL ON FUNCTION yawrd.'+name+'('));
});
test('legacy panel cannot send a wallet request just because public factory settings are populated',async()=>{
  const panel=await readFile(new URL('../app/components/creation-panel.tsx',import.meta.url),'utf8');
  const submit=panel.slice(panel.indexOf('async function submit()'),panel.indexOf('return <section'));
  assert.doesNotMatch(submit,/flow\.current\?\.submit|await sign|sign\(/);
  assert.match(panel,/disabled onClick=\{\(\) => \{ void submit/);
});

// Public deployment input already saved for this founder-authorized attempt.
// No private intake, session or credentials are copied from Development.
function authorizedFixture() {
  const allowed=authorizedCreationDeployment;
  const c:PrivateCreation={...structuredClone(creation),id:allowed.creationId,founderAccountId:allowed.founderAccountId,
    configuration:{...creation.configuration,publicName:'Yawrd Public Beta Test',
      publicDescription:'We are recording public evidence of the most up to date Yawrd creation process.',secondSteward:'keelbase.testnet'}};
  const p=prepareCreation(savedCreationInput(c,allowed.identifier),testnetFactorySettings,{accountId:c.founderAccountId,network:'testnet'});
  const intent:DeploymentIntent={creationId:c.id,network:'testnet',factoryAccountId:testnetFactorySettings.factoryAccountId,
    identifier:allowed.identifier,daoAccountId:allowed.daoAccountId,sourceRevision:c.revision,revision:2,state:'prepared',prepared:p,
    requestDigest:allowed.requestDigest,costs:null,preparedAt:now,attempt:0,claimedAt:null,notBeforeHeight:null,
    transactionHash:null,lastEvidence:null,evidenceAttempt:null,createdAt:now,updatedAt:now};
  const env={NODE_ENV:'development',DATABASE_URL:'postgresql://yawrd_07b_runtime@ep-twilight-voice-aorpfrbm.neon.tech/neondb?sslmode=require',
    YAWRD_DEV_DATABASE_ENDPOINT:'ep-twilight-voice-aorpfrbm'};
  return {c,intent,env};
}
function attemptTwoFixture() {
  const value=authorizedFixture();value.c.revision=6;
  const quote={setupDepositYocto:testnetFactorySettings.setupDepositYocto,createGas:testnetFactorySettings.createGas,
    observedGasPriceYocto:'100000000',attachedGasAtObservedPriceYocto:'30000000000000000000000',
    blockHash,blockHeight:'200',costConfirmation:testnetFactorySettings.costConfirmation};
  Object.assign(value.intent,{revision:10,attempt:1,sourceRevision:6,state:'prepared',costs:{...quote,retiredAttempts:[{
    attempt:1,revision:5,state:'unknown',sourceRevision:6,preparedAt:now,claimedAt:now,notBeforeHeight:'90',
    consentVersion:DEPLOYMENT_CONSENT,costs:quote,requestDigest:value.intent.requestDigest,transactionHash:null,
    confirmedBy:value.c.founderAccountId,confirmation:'closed-wallet-checked-testnet-no-approval-no-submission-v1',
    observations:[{blockHeight:100,blockHash},{blockHeight:124,blockHash},{blockHeight:200,blockHash}],retiredAt:now,
  }]}});
  return value;
}
test('bounded attempt 2 authorization accepts only the pinned request with its original retired claim',()=>{
  const {c,intent,env}=attemptTwoFixture();
  assert.equal(authorizedDevelopmentDeployment(c,intent,env),true);
  for(const changed of [{...c,id:creation.id},{...c,revision:7},{...c,founderAccountId:'other.testnet'},{...c,network:'mainnet'}])
    assert.equal(authorizedDevelopmentDeployment(changed as PrivateCreation,intent,env),false);
  for(const changed of [null,{...intent,creationId:creation.id},{...intent,identifier:'a'.repeat(12)},
    {...intent,daoAccountId:'other.factory.yawrd.testnet'},{...intent,factoryAccountId:'other.testnet'},
    {...intent,network:'mainnet'},{...intent,requestDigest:'f'.repeat(64)},
    {...intent,prepared:null},...['reserved','wallet-requested','unknown','failed','deployed-hardening-required'].map(state=>({...intent,state})),
    {...intent,attempt:0},{...intent,attempt:2},{...intent,attempt:3},{...intent,costs:null},
    {...intent,transactionHash:txHash},{...intent,evidenceAttempt:1}])
    assert.equal(authorizedDevelopmentDeployment(c,changed as DeploymentIntent|null,env),false);
  const before=structuredClone(intent);
  for(const edit of [
    r=>{r.attempt=2;},r=>{r.revision=6;},r=>{r.requestDigest='f'.repeat(64);},r=>{r.confirmedBy='other.testnet';},
  ] as ((r:any)=>void)[]){
    const changed=structuredClone(intent);edit(changed.costs!.retiredAttempts![0]);
    assert.equal(authorizedDevelopmentDeployment(c,changed,env),false);
  }
  assert.deepEqual(intent,before,'authorization does not modify the original archive or request');
  assert.equal(authorizedDevelopmentDeployment(c,{...intent,revision:11},env),true,'cost refresh may advance intent revision');
  for(const edit of [
    p=>{p.input.projectPurpose='Changed after authorization';},
    p=>{p.input.initialStewardAccountIds=['other.testnet'];},
    p=>{p.input.stewardApprovalThreshold=1;},
    p=>{p.transaction.signerId='other.testnet';},
    p=>{p.transaction.network='mainnet';},
    p=>{p.transaction.actions[0].params.deposit='2000000000000000000000000';},
    p=>{p.transaction.actions[0].params.gas='299000000000000';},
    p=>{p.settings.expectedFactoryCodeHash='Z'.repeat(43);},
  ] as ((p:any)=>void)[]) {
    const changed=structuredClone(intent);edit(changed.prepared);
    assert.equal(authorizedDevelopmentDeployment(c,changed,env),false);
  }
  for(const overrides of [{NODE_ENV:'production'},{VERCEL_ENV:'production'},{VERCEL_ENV:'preview'},
    {YAWRD_DEV_DATABASE_ENDPOINT:undefined},{DATABASE_URL:undefined},
    {DATABASE_URL:env.DATABASE_URL.replace('/neondb?','/production?')},
    {DATABASE_URL:env.DATABASE_URL.replace('ep-twilight-voice-aorpfrbm','ep-other'),YAWRD_DEV_DATABASE_ENDPOINT:'ep-other'}])
    assert.equal(authorizedDevelopmentDeployment(c,intent,{...env,...overrides}),false);
});
test('HTTP evaluates server-owned scope after preparation and on every claim, preserving consent, preflight and one-attempt bounds',async()=>{
  const h=durableHarness();
  const permitted=(c:PrivateCreation,i:DeploymentIntent|null)=>c.id===creation.id&&c.founderAccountId===creation.founderAccountId&&
    i?.attempt===0&&i.state==='prepared'&&i.prepared?.input.projectName===creation.configuration.publicName;
  const prepared=await h.send({action:'prepare',expectedRevision:3},permitted);
  assert.equal(prepared.status,200);const view=await prepared.json();assert.equal(view.submissionEnabled,true);
  assert.equal((await (await h.send(undefined,permitted)).json()).submissionEnabled,true);
  const data={action:'begin',expectedRevision:3,intentRevision:view.intent.revision,consent:true,consentVersion:DEPLOYMENT_CONSENT};
  assert.equal((await h.send({...data,consent:false},permitted)).status,400);
  assert.equal((await h.send({...data,expectedRevision:2},permitted)).status,409);
  h.f.setExists(true);
  assert.equal((await h.send(data,permitted)).status,503,'fresh chain collision prevents a claim');
  assert.equal(h.intents.get(creation.id)!.attempt,0);
  h.f.setExists(false);h.f.setFinalHeight(90);
  assert.equal((await h.send(data,permitted)).status,200);
  assert.equal(h.intents.get(creation.id)!.attempt,1);
  assert.equal((await (await h.send(undefined,permitted)).json()).submissionEnabled,false);
  assert.equal((await h.send(data,permitted)).status,403);
  assert.equal(h.calls.filter(call=>call.sql.includes('deployment_claim')).length,1);
  const denied=durableHarness();await ready(denied);
  assert.equal((await denied.send({...data,intentRevision:denied.intents.get(creation.id)!.revision},()=>false)).status,403);
  assert.equal(denied.calls.some(call=>call.sql.includes('deployment_claim')),false);
});

test('Creation transport reuses FASTNEAR with a bounded abort signal and never broadcasts',async()=>{
  const calls:{url:string;method:string;signal:AbortSignal}[]=[];
  const rpc=createTestnetRpc((async(url,options)=>{
    calls.push({url:String(url),method:JSON.parse(String(options?.body)).method,signal:options!.signal as AbortSignal});
    return Response.json({result:{chain_id:'testnet'}});
  }) as typeof fetch);
  await rpc('status',{});
  assert.equal(calls[0].url,'https://test.rpc.fastnear.com');assert.ok(calls[0].signal instanceof AbortSignal);
  await assert.rejects(rpc('broadcast_tx_commit',{}),/Read-only/);assert.equal(calls.length,1);
});
test('Meteor signer preparation completes before a durable claim; readiness failures consume no attempt',async()=>{
  const h=durableHarness(),a=await ready(h);let signed=0;
  await assert.rejects(submitDeployment({creationRevision:3,founder:creation.founderAccountId,reviewed:a,request:h.request,
    getWallet:()=>({accountId:creation.founderAccountId,network:'testnet'}),
    prepareSign:async transaction=>{assert.deepEqual(transaction,a.prepared!.transaction);throw new Error('lookup failed');},
    sign:async()=>{signed++;}}),/lookup failed/);
  assert.equal(signed,0);assert.equal(h.intents.get(creation.id)!.attempt,0);
  assert.equal(h.calls.some(c=>c.sql.includes('deployment_claim')),false);
});

function recoveryTransport(h:ReturnType<typeof durableHarness>):Rpc {
  return async(method,params)=>{
    if(method==='block'&&typeof params.block_id==='number')return {header:{height:params.block_id,hash:params.block_id===100?'A'.repeat(43):'B'.repeat(43)}};
    return h.f.rpc(method,params);
  };
}
const recoveryObservations:[{blockHeight:number;blockHash:string},{blockHeight:number;blockHash:string}]=[
  {blockHeight:100,blockHash:'A'.repeat(43)},{blockHeight:124,blockHash:'B'.repeat(43)}];
test('operator retirement is disabled by default and requires no-hash, consent, CAS and separated finalized checks',async()=>{
  const h=durableHarness(),a=await ready(h),claimed=await claim(h,a),rpc=recoveryTransport(h);
  const initialCalls=h.calls.length;
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,recoveryObservations,true,rpc),/not_authorized/);
  assert.equal(h.calls.length,initialCalls);
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,recoveryObservations,false,rpc,true),/confirmation_required/);
  const close:[typeof recoveryObservations[0],typeof recoveryObservations[0]]=[recoveryObservations[0],{blockHeight:110,blockHash:'B'.repeat(43)}];
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,close,true,rpc,true),/observations_unconfirmed/);
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision-1,1,recoveryObservations,true,rpc,true),/revision_conflict/);
  h.intents.get(creation.id)!.transaction_hash=txHash;
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,recoveryObservations,true,rpc,true),/hash_required_or_resolved/);
  assert.equal(h.intents.get(creation.id)!.attempt,1);assert.equal(h.intents.get(creation.id)!.state,'wallet-requested');
});
test('proposed retirement retains the original claim, request, identity and counter, and never enables signing',async()=>{
  const h=durableHarness(),a=await ready(h),claimed=await claim(h,a),rpc=recoveryTransport(h);
  // Existing installed SQL cannot perform this recovery; a reviewed function
  // update is an explicit boundary, never bypassed by application code.
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,recoveryObservations,true,rpc,true),/unresolved/);
  h.installRecovery();
  const result=await retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,recoveryObservations,true,rpc,true);
  assert.equal(result.intent!.attempt,1);assert.equal(result.intent!.identifier,a.identifier);
  assert.equal(result.intent!.state,'prepared');assert.equal(result.submissionEnabled,false);
  assert.deepEqual(result.intent!.prepared,a.prepared);assert.equal(result.intent!.sourceRevision,a.sourceRevision);
  const retired=result.intent!.costs!.retiredAttempts![0];
  assert.equal(retired.revision,claimed.revision);assert.equal(retired.attempt,1);
  assert.equal(retired.claimedAt,claimed.claimedAt);assert.equal(retired.notBeforeHeight,claimed.notBeforeHeight);
  assert.equal(retired.requestDigest,claimed.requestDigest);assert.equal(retired.transactionHash,null);
  assert.equal(retired.observations.length,3);assert.equal(retired.confirmedBy,creation.founderAccountId);
  assert.deepEqual(retired.costs,claimed.costs);assert.equal(retired.preparedAt,claimed.preparedAt);
  assert.equal(retired.sourceRevision,claimed.sourceRevision);assert.equal(retired.consentVersion,DEPLOYMENT_CONSENT);
  assert.equal(result.fundingEnabled,false);assert.equal(result.publicationEnabled,false);assert.equal(result.platformFeesEnabled,false);
});

test('a transaction hash discovered during recovery observations wins over hashless retirement',async()=>{
  const h=durableHarness(),a=await ready(h),claimed=await claim(h,a);h.installRecovery();
  const base=recoveryTransport(h);let discovered=false;
  const rpc:Rpc=async(method,params)=>{
    const result=await base(method,params);
    if(!discovered&&method==='block'&&params.finality==='final'){
      discovered=true;await h.repo.noteDeployment(h.hash,creation.id,claimed.revision,1,txHash);
    }
    return result;
  };
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,recoveryObservations,true,rpc,true),/revision_conflict/);
  const row=h.intents.get(creation.id)!;
  assert.equal(row.transaction_hash,txHash);assert.equal(row.state,'unknown');assert.equal(row.attempt,1);
  assert.equal(row.costs.retiredAttempts,undefined);
});
test('RPC uncertainty or a deployed account blocks retirement without changing the attempt',async()=>{
  const h=durableHarness(),a=await ready(h),claimed=await claim(h,a);h.installRecovery();
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,recoveryObservations,true,
    async()=>{throw new Error('uncertain RPC');},true),/uncertain RPC/);
  h.f.setExists(true);
  await assert.rejects(retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,claimed.revision,1,recoveryObservations,true,recoveryTransport(h),true),/already|collision|account/i);
  const row=h.intents.get(creation.id)!;assert.equal(row.attempt,1);assert.equal(row.state,'wallet-requested');
  assert.equal(row.costs.retiredAttempts,undefined);
});

test('running HTTP retirement stays forbidden even to the owner and never resets the recorded claim',async()=>{
  const h=durableHarness(),a=await ready(h),claimed=await claim(h,a);
  const response=await h.send({action:'retire',expectedRevision:3,intentRevision:claimed.revision,attempt:1,
    observations:recoveryObservations,founderConfirmed:true},true);
  assert.equal(response.status,403);assert.equal((await response.json()).error,'deployment_recovery_not_authorized');
  assert.equal(h.intents.get(creation.id)!.attempt,1);assert.equal(h.intents.get(creation.id)!.state,'wallet-requested');
});

test('one-time recovery gate permits only the authorized original Development claim and never enables signing',()=>{
  const {c,intent,env}=authorizedFixture();c.revision=6;
  Object.assign(intent,{revision:5,attempt:1,state:'unknown'});
  assert.equal(authorizedDevelopmentRecovery(c,intent,env),true);
  assert.equal(authorizedDevelopmentDeployment(c,intent,env),false);
  for(const changed of [{...c,revision:5},{...c,revision:7},{...c,id:creation.id},
    {...c,founderAccountId:'other.testnet'},{...c,network:'mainnet'}])
    assert.equal(authorizedDevelopmentRecovery(changed as PrivateCreation,intent,env),false);
  for(const changed of [null,{...intent,revision:4},{...intent,revision:6},{...intent,attempt:0},{...intent,attempt:2},
    {...intent,state:'prepared'},{...intent,state:'wallet-requested'},{...intent,creationId:creation.id},
    {...intent,daoAccountId:'other.factory.yawrd.testnet'},{...intent,identifier:'a'.repeat(12)},
    {...intent,requestDigest:'f'.repeat(64)},{...intent,transactionHash:txHash},{...intent,evidenceAttempt:1},
    {...intent,prepared:{...intent.prepared!,input:{...intent.prepared!.input,projectName:'Changed request'}}}])
    assert.equal(authorizedDevelopmentRecovery(c,changed as DeploymentIntent|null,env),false);
  for(const overrides of [{NODE_ENV:'production'},{VERCEL_ENV:'production'},
    {YAWRD_DEV_DATABASE_ENDPOINT:'ep-other'},{DATABASE_URL:env.DATABASE_URL.replace('/neondb?','/other?')}])
    assert.equal(authorizedDevelopmentRecovery(c,intent,{...env,...overrides}),false);
  const retired={...intent,revision:6,state:'prepared' as const};
  assert.equal(authorizedDevelopmentRecovery(c,retired,env),false,'successful retirement consumes the exact-revision permission');
  assert.equal(authorizedDevelopmentDeployment(c,retired,env),false,'retirement does not enable attempt 2');
});

test('retirement uses the existing session cookie: expired sessions fail before recovery and renewed sessions can retire',async()=>{
  const h=durableHarness(),a=await ready(h),claimed=await claim(h,a);h.installRecovery();
  const renewed='c'.repeat(43),origin='https://yawrd.example';let recoveryChecks=0;
  const query:Query=async(sql,args=[])=>{
    if(sql.includes('FROM yawrd.sessions'))return args[0]===hashToken(renewed)?[{account_id:creation.founderAccountId}]:[];
    if(args[0]===hashToken(token))throw Object.assign(new Error('sign_in_required'),{code:'P0001'});
    return h.query(sql,args);
  };
  const data={action:'retire',expectedRevision:3,intentRevision:claimed.revision,attempt:1,
    observations:recoveryObservations,founderConfirmed:true};
  const makeRequest=(session:string|null,path:string,post:boolean)=>new Request(origin+path,{
    method:post?'POST':'GET',headers:{host:'yawrd.example',origin,'content-type':'application/json',
      'x-yawrd-account':creation.founderAccountId,...(session?{cookie:SESSION_COOKIE+'='+session}:{})},
    ...(post?{body:JSON.stringify(data)}:{}),
  });
  const gate=()=>{recoveryChecks++;return true;};
  for(const session of [null,token]){
    const auth=await authSessionRequest(makeRequest(session,'/api/auth/session',false),query,origin);
    assert.equal((await auth.json()).accountId,null);
    const response=await creationDeploymentRequest(makeRequest(session,'/api/creations/'+creation.id+'/deployment',true),
      creation.id,query,origin,settings,recoveryTransport(h),false,gate);
    assert.equal(response.status,401);assert.equal((await response.json()).error,'sign_in_required');
  }
  assert.equal(recoveryChecks,0,'the 401 occurs before the recovery gate');
  const auth=await authSessionRequest(makeRequest(renewed,'/api/auth/session',false),query,origin);
  assert.equal((await auth.json()).accountId,creation.founderAccountId);
  const response=await creationDeploymentRequest(makeRequest(renewed,'/api/creations/'+creation.id+'/deployment',true),
    creation.id,query,origin,settings,recoveryTransport(h),false,gate);
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.intent.state,'prepared');assert.equal(result.intent.attempt,1);
  assert.equal(result.intent.identifier,a.identifier);assert.equal(result.intent.costs.retiredAttempts.length,1);
  assert.equal(result.submissionEnabled,false);assert.equal(recoveryChecks,1);
});

test('attempt 2 refresh preserves retired attempt 1 and claims durably before the prepared Meteor adapter',async()=>{
  const h=durableHarness(),a=await ready(h),first=await claim(h,a);h.installRecovery();
  const retired=await retireUnsubmittedDeployment(h.repo,h.hash,creation.id,3,first.revision,1,recoveryObservations,true,recoveryTransport(h),true);
  const archive=structuredClone(retired.intent!.costs!.retiredAttempts);
  const refreshed=await prepareDurableDeployment(h.repo,h.hash,creation.id,3,settings,h.f.rpc,true);
  assert.equal(refreshed.intent!.identifier,a.identifier);assert.deepEqual(refreshed.intent!.prepared,a.prepared);
  assert.deepEqual(refreshed.intent!.costs!.retiredAttempts,archive);let signed=0,preparedSigner=false;
  const result=await submitDeployment({creationRevision:3,founder:creation.founderAccountId,reviewed:refreshed.intent!,request:h.request,
    getWallet:()=>({accountId:creation.founderAccountId,network:'testnet'}),
    prepareSign:async tx=>{assert.deepEqual(tx,a.prepared!.transaction);assert.equal(h.intents.get(creation.id)!.attempt,1);preparedSigner=true;},
    sign:async tx=>{assert.equal(preparedSigner,true);assert.equal(h.intents.get(creation.id)!.attempt,2);
      assert.equal(h.intents.get(creation.id)!.state,'wallet-requested');assert.deepEqual(tx,a.prepared!.transaction);signed++;return {};},
  });
  assert.equal(signed,1);assert.equal(result.intent!.attempt,2);assert.equal(result.intent!.state,'unknown');
  assert.deepEqual(result.intent!.costs!.retiredAttempts,archive);assert.equal(result.intent!.identifier,a.identifier);
  assert.equal(result.submissionEnabled,false);
  await assert.rejects(h.request({action:'begin',expectedRevision:3,intentRevision:result.intent!.revision,consent:true,consentVersion:DEPLOYMENT_CONSENT}),/unresolved/);
});
