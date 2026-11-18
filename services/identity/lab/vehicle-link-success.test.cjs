const { test } = require("node:test"), assert = require("node:assert/strict"), { randomUUID } = require("node:crypto");
const { DurableLinkError, PrivateDurableVehicleLink } = require("./vehicle-link-durable-contract.ts");
const { prepare, VehicleSuccessReceiptReader } = require("./vehicle-link-success-authority.cjs");
const userId=randomUUID(), membershipId=randomUUID(), accountId=randomUUID();
const normalizers={plate:v=>typeof v==='string'?v.trim().toUpperCase():v,label:v=>typeof v==='string'?v.trim():v};
const makeCommand=()=>({contractVersion:2,operationId:randomUUID(),expectedMembershipId:membershipId,plate:'ABC-123',label:'Synthetic'});
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code&&e.message===code);
function fixture(){
  const command=makeCommand(), principal={kind:'member',userId,permissions:['vehicle:link:own','vehicle:result:own']};let sends=0;
  const receipt={contractVersion:2,policyVersion:'SUCCESS_ONLY_V1',callerNamespace:'synthetic-identity',operationId:command.operationId,
    userId,membershipId,vehicleId:randomUUID(),requestDigest:'a'.repeat(64),plate:'ABC-123',label:'Persisted',recordedAt:'2026-11-16T00:00:00.000Z'};
  const authorization={async authenticate(key){if(key!=='synthetic-credential')throw new DurableLinkError('DENIED');return principal;}};
  const identity={async forUser(){return{membershipId,accountId};}};
  const commands={async submit(){sends++;return{status:'COMMITTED',receipt};}};
  const results={async lookup(){return{status:'COMMITTED',receipt};}};
  return{command,principal,receipt,authorization,identity,commands,results,sends:()=>sends,
    service:new PrivateDurableVehicleLink(authorization,identity,commands,results,{synthetic:true})};
}
test('4B.1 digest binds normalized intention and principal, not transport credential',()=>{
  const c=makeCommand(),a=prepare(userId,c,'synthetic-identity',normalizers,DurableLinkError);
  assert.equal(a.digest,prepare(userId,{...c,plate:' abc-123 ',label:' Synthetic '},'synthetic-identity',normalizers,DurableLinkError).digest);
  for(const [user,command,namespace]of [[randomUUID(),c,'synthetic-identity'],[userId,{...c,label:'Changed'},'synthetic-identity'],
    [userId,{...c,plate:'DEF-456'},'synthetic-identity'],[userId,c,'different-caller']])
    assert.notEqual(a.digest,prepare(user,command,namespace,normalizers,DurableLinkError).digest);
});
for(const change of [{contractVersion:1},{operationId:'invalid'},{plate:'invalid'},{label:''},{userId:randomUUID()}])
  test('4B.1 invalid or forged command '+JSON.stringify(change),()=>{
    assert.throws(()=>prepare(userId,{...makeCommand(),...change},'synthetic-identity',normalizers,DurableLinkError),e=>e.code==='INVALID_INPUT');
  });
test('4B.1 query returns historical receipt without dispatching another command',async()=>{
  const f=fixture();assert.equal((await f.service.submit('synthetic-credential',f.command)).status,'COMMITTED');
  for(let i=0;i<5;i++)assert.deepEqual((await f.service.lookup('synthetic-credential',f.command.operationId)).receipt,f.receipt);
  assert.equal(f.sends(),1);assert.ok(Object.isFrozen((await f.service.lookup('synthetic-credential',f.command.operationId)).receipt));
});
test('4B.1 NOT_OBSERVED remains absence, not a fabricated failure or success',async()=>{
  const f=fixture();f.results.lookup=async()=>({status:'NOT_OBSERVED'});
  assert.deepEqual(await f.service.lookup('synthetic-credential',randomUUID()),{status:'NOT_OBSERVED'});assert.equal(f.sends(),0);
});
test('4B.1 raw submit failure stays unknown without automatic resend',async()=>{
  const f=fixture();let calls=0;f.commands.submit=async()=>{calls++;throw Error('synthetic lost reply');};
  await rejects(f.service.submit('synthetic-credential',f.command),'OUTCOME_UNKNOWN');assert.equal(calls,1);
});
test('4B.1 unavailable result provider cannot turn into NOT_OBSERVED',async()=>{
  const f=fixture();f.results.lookup=async()=>{throw Error('synthetic provider detail');};
  await rejects(f.service.lookup('synthetic-credential',f.command.operationId),'UNAVAILABLE');assert.equal(f.sends(),0);
});
test('4B.1 denied query never labels the historical command rejected',async()=>{
  const f=fixture();f.principal.permissions=[];
  await assert.rejects(f.service.lookup('synthetic-credential',f.command.operationId),e=>e.code==='DENIED'&&e.outcome==='UNKNOWN');
  assert.equal(f.sends(),0);
});
test('4B.1 wrong credential or requested membership cannot dispatch',async()=>{
  const f=fixture();await rejects(f.service.submit({userId},f.command),'DENIED');
  await rejects(f.service.submit('synthetic-credential',{...f.command,expectedMembershipId:randomUUID()}),'DENIED');assert.equal(f.sends(),0);
});
for(const permission of ['vehicle:link:own','vehicle:result:own'])test('4B.1 missing capability '+permission,async()=>{
  const f=fixture();f.principal.permissions=[];
  await rejects(permission==='vehicle:link:own'?f.service.submit('synthetic-credential',f.command):f.service.lookup('synthetic-credential',f.command.operationId),'DENIED');
});
for(const change of [{userId:randomUUID()},{membershipId:randomUUID()},{vehicleId:'invalid'},{requestDigest:'invalid'},{policyVersion:'unknown'}])
  test('4B.1 malformed or foreign receipt is never exposed '+JSON.stringify(change),async()=>{
    const f=fixture();Object.assign(f.receipt,change);await rejects(f.service.lookup('synthetic-credential',f.command.operationId),'OUTCOME_UNKNOWN');
  });
test('4B.1 result reader physically exposes no submit and checks current eligibility before reading receipt',async()=>{
  let queries=0;const reader=new VehicleSuccessReceiptReader({synthetic:true,callerNamespace:'synthetic-identity',ErrorType:DurableLinkError,
    reader:{snapshot:async work=>work({membership:{findUnique:async()=>({id:membershipId,status:'SUSPENDED',user:{active:true}})},
      $queryRawUnsafe:async()=>{queries++;return[];}})}});
  await rejects(reader.lookup({userId,expectedMembershipId:membershipId,operationId:randomUUID()}),'DENIED');
  assert.equal(queries,0);assert.equal(typeof reader.submit,'undefined');
});
