const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { prepare } = require('./vehicle-link-success-authority.cjs');
const { RecoveryError, VehicleRecoveryInspector, PrivateRecoveryDiagnostics, validateManifest } = require('./vehicle-recovery-inspector.cjs');
const { LaboratoryQuarantine } = require('./vehicle-recovery-quarantine.cjs');
const normalizers = { plate: v => v.trim().toUpperCase(), label: v => v.trim() };
const copy = v => JSON.parse(JSON.stringify(v));
function fixture() {
  const userId=randomUUID(), membershipId=randomUUID(), vehicleId=randomUUID();
  const command={contractVersion:2,operationId:randomUUID(),expectedMembershipId:membershipId,plate:'AAA-123',label:'Requested'};
  const p=prepare(userId,command,'synthetic-recovery',normalizers,RecoveryError);
  const receipt={contractVersion:2,policyVersion:'SUCCESS_ONLY_V1',callerNamespace:'synthetic-recovery',operationId:command.operationId,
    userId,membershipId,vehicleId,requestDigest:p.digest,plate:p.plate,label:'Persisted previous label',recordedAt:'2026-11-18T00:00:00.000Z'};
  const manifest={synthetic:true,datasetId:'a4-'+'a'.repeat(24),namespace:'synthetic-recovery',checkpoint:'fixture-cut-1',
    subjects:[{userId,membershipId}],expected:[{userId,command,acknowledged:true,receipt}],legacy:[]};
  const data={provenance:{datasetId:manifest.datasetId,checkpoint:manifest.checkpoint},receipts:[copy(receipt)],
    vehicles:[{id:vehicleId,membershipId,plate:p.plate,label:receipt.label}],memberships:[{id:membershipId,userId,status:'ACTIVE'}],users:[{id:userId,active:true}]};
  return {manifest,data,command,userId,membershipId,inspector:(d=data,m=manifest)=>new VehicleRecoveryInspector({synthetic:true,manifest:m,normalizers,snapshot:async()=>copy(d)})};
}
function gate(f) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'a4-quarantine-'));
  fs.writeFileSync(path.join(directory,'dataset.json'),JSON.stringify({datasetId:f.manifest.datasetId}),{flag:'wx'});
  return {directory,instance:()=>new LaboratoryQuarantine({synthetic:true,directory,datasetId:f.manifest.datasetId})};
}
const codes=r=>r.findings.map(f=>f.code);
test('4B.2A coherent result verifies request digest without using persisted label',async()=>{
  const f=fixture(),r=await f.inspector().inspect();assert.equal(r.classification,'CONSISTENT');assert.ok(Object.isFrozen(r));
});
for(const [name,change,code] of [
  ['receipt without Vehicle',d=>d.vehicles=[],'RECEIPT_WITHOUT_VEHICLE'],
  ['confirmed expectation missing receipt',d=>d.receipts=[],'EXPECTED_SUCCESS_RECEIPT_MISSING'],
  ['incompatible digest',d=>d.receipts[0].requestDigest='b'.repeat(64),'DIGEST_MISMATCH'],
  ['incorrect operationId',d=>d.receipts[0].operationId=randomUUID(),'EXPECTED_SUCCESS_RECEIPT_MISSING'],
  ['incorrect namespace',d=>d.receipts[0].callerNamespace='other-service','NAMESPACE_MISMATCH'],
  ['incorrect UUID',d=>d.receipts[0].vehicleId='not-a-uuid','INVALID_RECEIPT'],
  ['incorrect owner',d=>d.vehicles[0].membershipId=randomUUID(),'VEHICLE_BINDING_MISMATCH'],
  ['duplicate operation key',d=>d.receipts.push({...d.receipts[0],requestDigest:'c'.repeat(64)}),'DUPLICATE_OPERATION_KEY'],
  ['duplicate Vehicle UUID',d=>d.vehicles.push({...d.vehicles[0]}),'DUPLICATE_VEHICLE_UUID'],
  ['partial checkpoint',d=>d.provenance.checkpoint='other-cut','SOURCE_CUT_MISMATCH'],
]) test('4B.2A detects '+name,async()=>{const f=fixture();change(f.data);const r=await f.inspector().inspect();assert.equal(r.classification,'INCONSISTENT');assert.ok(codes(r).includes(code));});
test('4B.2A declared legacy links are not corruption; unattributed links are indeterminate',async()=>{
  const f=fixture();f.data.receipts=[];f.manifest.expected=[];f.manifest.legacy=[{...f.data.vehicles[0]}];
  assert.equal((await f.inspector().inspect()).classification,'CONSISTENT');f.manifest.legacy=[];
  const r=await f.inspector().inspect();assert.equal(r.classification,'INDETERMINATE');assert.ok(codes(r).includes('UNATTRIBUTED_LINK'));
});
test('4B.2A unknown pending absence remains indeterminate',async()=>{
  const f=fixture();f.data.receipts=[];f.data.vehicles=[];f.manifest.expected[0].acknowledged=false;delete f.manifest.expected[0].receipt;
  const r=await f.inspector().inspect();assert.equal(r.classification,'INDETERMINATE');assert.deepEqual(codes(r),['NOT_OBSERVED']);
});
test('4B.2A continuity unavailable is indeterminate and source errors sanitized',async()=>{
  const f=fixture();delete f.data.provenance;assert.equal((await f.inspector().inspect()).classification,'INDETERMINATE');
  const i=new VehicleRecoveryInspector({synthetic:true,manifest:f.manifest,normalizers,snapshot:async()=>{throw Error('private provider detail');}});
  const r=await i.inspect();assert.deepEqual(codes(r),['SOURCE_UNAVAILABLE']);assert.ok(!JSON.stringify(r).includes('private provider'));
});
test('4B.2A an unknown receipt cannot claim verified intention',async()=>{
  const f=fixture();f.manifest.expected=[];const r=await f.inspector().inspect();assert.equal(r.classification,'INDETERMINATE');assert.ok(codes(r).includes('INTENTION_UNAVAILABLE'));
});
test('4B.2A diagnostics do not mutate supplied data or manifest',async()=>{
  const f=fixture(),before=copy({data:f.data,manifest:f.manifest});await f.inspector().inspect();assert.deepEqual({data:f.data,manifest:f.manifest},before);
});
test('4B.2A owner diagnostics mask foreign and missing operations and reveal no global owner findings',async()=>{
  const f=fixture(),i=f.inspector(),actor={kind:'member',userId:randomUUID(),permissions:['vehicle:result:own']};
  assert.deepEqual(await i.lookupOwn(actor,f.command.operationId),await i.lookupOwn(actor,randomUUID()));
  const own=await i.lookupOwn({...actor,userId:f.userId},f.command.operationId);assert.equal(own.classification,'CONSISTENT');
  assert.ok(!JSON.stringify(own).includes(f.membershipId));
  await assert.rejects(i.lookupOwn({...actor,permissions:[]},f.command.operationId),e=>e.code==='DENIED');
});
test('4B.2A immutable trusted expectations reject duplicate keys or crossed subjects',()=>{
  const f=fixture();f.manifest.expected.push(copy(f.manifest.expected[0]));assert.throws(()=>validateManifest(f.manifest,normalizers));
});
test('4B.2A synthetic boundary rejects forged principals and member global inspection before any snapshot',async()=>{
  const f=fixture();let reads=0;
  const i=new VehicleRecoveryInspector({synthetic:true,manifest:f.manifest,normalizers,snapshot:async()=>{reads++;return copy(f.data);}});
  const api=new PrivateRecoveryDiagnostics({synthetic:true,inspector:i,authorization:{async authenticate(c){
    if(c==='member-fixture')return{kind:'member',userId:f.userId,permissions:['vehicle:result:own']};
    if(c==='reconciler-fixture')return{kind:'reconciler',permissions:['vehicle:recovery:inspect']};
    throw Error('invalid');}}});
  await assert.rejects(api.lookup({kind:'member',userId:f.userId},f.command.operationId),e=>e.code==='DENIED');
  await assert.rejects(api.inspect('member-fixture'),e=>e.code==='DENIED');assert.equal(reads,0);
  assert.equal((await api.lookup('member-fixture',f.command.operationId)).classification,'CONSISTENT');
  assert.equal((await api.inspect('reconciler-fixture')).classification,'CONSISTENT');assert.equal(reads,2);
});
test('4B.2A quarantine survives new instance and healthy assessment cannot clear it',async()=>{
  const f=fixture(),g=gate(f);f.data.receipts=[];const q=g.instance();assert.equal((await q.assess(f.inspector())).admission,'QUARANTINED');
  const good=fixture();assert.equal((await g.instance().assess(good.inspector())).admission,'QUARANTINED');let calls=0;
  await assert.rejects(g.instance().execute({authorize:async()=>{},inspector:good.inspector(),submit:async()=>calls++}),e=>e.code==='RECOVERY_REQUIRED');assert.equal(calls,0);
});
test('4B.2A indeterminate inspection latches quarantine and prevents callback',async()=>{
  const f=fixture(),g=gate(f);delete f.data.provenance;let calls=0;
  await assert.rejects(g.instance().execute({authorize:async()=>{},inspector:f.inspector(),submit:async()=>calls++}),e=>e.code==='RECOVERY_REQUIRED');
  assert.equal(calls,0);assert.equal(g.instance().state().status,'QUARANTINED');
});
test('4B.2A healthy gate delegates once; concurrent competing gate fails closed',async()=>{
  const f=fixture(),g=gate(f);let enter,release;const ready=new Promise(r=>enter=r),wait=new Promise(r=>release=r);let calls=0;
  const first=g.instance().execute({authorize:async()=>{},inspector:f.inspector(),submit:async()=>{calls++;enter();await wait;return 'ok';}});
  await ready;try{await assert.rejects(g.instance().execute({authorize:async()=>{},inspector:f.inspector(),submit:async()=>calls++}),e=>e.code==='RECOVERY_REQUIRED');}finally{release();}
  assert.equal(await first,'ok');assert.equal(calls,1);
});
test('4B.2A failed authorization cannot inspect or submit',async()=>{
  const f=fixture(),g=gate(f);let calls=0;await assert.rejects(g.instance().execute({authorize:async()=>{throw new RecoveryError('DENIED');},
    inspector:{inspect:async()=>calls++},submit:async()=>calls++}),e=>e.code==='DENIED');assert.equal(calls,0);
});
test('4B.2A stale lock, unreadable marker and wrong dataset fail closed',async()=>{
  const f=fixture(),g=gate(f);fs.writeFileSync(path.join(g.directory,'admission.lock'),'stale',{flag:'wx'});
  await assert.rejects(g.instance().assess(f.inspector()),e=>e.code==='RECOVERY_REQUIRED');
  const h=gate(f);fs.writeFileSync(path.join(h.directory,'quarantine.json'),'broken',{flag:'wx'});assert.equal(h.instance().state().status,'QUARANTINED');
  assert.throws(()=>new LaboratoryQuarantine({synthetic:true,directory:h.directory,datasetId:'a4-'+'b'.repeat(24)}));
});
