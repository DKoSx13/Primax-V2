// Fresh-resource 4B.2A provider/diagnostic worker. No public bootstrap.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {VehicleRecoveryInspector,PrivateRecoveryDiagnostics,RecoveryError}=require('../../services/identity/lab/vehicle-recovery-inspector.cjs');
const {LaboratoryQuarantine}=require('../../services/identity/lab/vehicle-recovery-quarantine.cjs');
const mode=process.argv[2],runId=process.env.A4_READ_RUN;
assert.ok(['scenarios','verify-quarantine'].includes(mode));assert.match(runId,/^a4-[a-f0-9]{24}$/);
assert.equal(process.env.A4_READ_SYNTHETIC,'true');
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
function control(name,create=false){assert.match(name,/^[a-z_]+$/);const directory='/control/'+name;
  if(create){fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'dataset.json'),JSON.stringify({datasetId:runId}),{flag:'wx',mode:0o600});}
  return new LaboratoryQuarantine({synthetic:true,directory,datasetId:runId});}
const blocked=e=>e.code==='RECOVERY_REQUIRED';
(async()=>{
  if(mode==='verify-quarantine'){
    const evidence=JSON.parse(fs.readFileSync('/control/latch-evidence.json','utf8'));assert.equal(evidence.datasetId,runId);let calls=0;
    for(const [name,digest]of Object.entries(evidence.hashes)){
      const q=control(name);assert.equal(q.state().status,'QUARANTINED');
      assert.equal(hash(fs.readFileSync('/control/'+name+'/quarantine.json','utf8')),digest);
      await assert.rejects(q.execute({authorize:async()=>{},inspector:{inspect:async()=>{calls++;return{classification:'CONSISTENT'};}},submit:async()=>calls++}),blocked);
    }
    assert.equal(calls,0);console.log(JSON.stringify({success:true,checked:Object.keys(evidence.hashes).length,network:'none',submissions:0,inspectionsBeforeBlock:0}));return;
  }
  const ctx=await require('./identity-a4-vehicle-receipt-support.cjs')();
  const checks=[],cases=[],statements=[];let readTransactions=0;
  const pass=name=>{checks.push('4B.2A '+name);process.stderr.write('PASS 4B.2A '+name+'\n');};
  try{
    // New synthetic subjects only; no update of Membership.status/User.active.
    const subjects=[];
    for(let i=0;i<2;i++){
      const userId=randomUUID(),membershipId=randomUUID(),accountId=randomUUID();
      await ctx.admin.user.create({data:{id:userId,name:'Synthetic recovery owner',email:'recovery-'+i+'@synthetic.invalid',passwordHash:'synthetic-not-a-login-hash'}});
      await ctx.admin.membership.create({data:{id:membershipId,userId,number:'RECOVERY-00'+i}});
      subjects.push({userId,membershipId,accountId});
    }
    const ns='synthetic-recovery';
    const authority=new ctx.classes.VehicleSuccessAuthority({...ctx.options,callerNamespace:ns});
    const resultReader=new ctx.classes.VehicleSuccessReceiptReader({...ctx.options,callerNamespace:ns});
    const credentials=subjects.map(()=>randomUUID()),reconcilerCredential=randomUUID();
    const authorization={async authenticate(key){if(key===reconcilerCredential)return{kind:'reconciler',permissions:['vehicle:recovery:inspect']};
      const i=credentials.indexOf(key);if(i<0)throw new RecoveryError('DENIED');
      return{kind:'member',userId:subjects[i].userId,permissions:['vehicle:link:own','vehicle:result:own']};}};
    const identity={async forUser(actor){const s=subjects.find(s=>s.userId===actor.userId);if(!s)throw new RecoveryError('DENIED');return s;}};
    const facade=new ctx.contract.PrivateDurableVehicleLink(authorization,identity,authority,resultReader,{synthetic:true});
    const command=(i,plate,label='Synthetic requested')=>({contractVersion:2,operationId:randomUUID(),expectedMembershipId:subjects[i].membershipId,plate,label});
    const prior=await ctx.admin.vehicle.create({data:{plate:'REC-001',label:'Previous persisted label',membershipId:subjects[0].membershipId}});
    const legacy=await ctx.admin.vehicle.create({data:{plate:'LEG-201',label:'Declared legacy fixture',membershipId:subjects[0].membershipId}});
    const expected=[];
    async function commit(i,c){const r=await facade.submit(credentials[i],c);expected.push({userId:subjects[i].userId,command:c,acknowledged:true,receipt:r.receipt});return r;}
    const a=await commit(0,command(0,prior.plate,'Different requested label'));
    await commit(1,command(1,'REC-002'));
    assert.equal(a.receipt.vehicleId,prior.id);assert.equal(a.receipt.label,prior.label);
    let manifest={synthetic:true,datasetId:runId,namespace:ns,checkpoint:'explicit-fixture-cut-1',subjects:subjects.map(({userId,membershipId})=>({userId,membershipId})),
      expected,legacy:[{id:legacy.id,membershipId:legacy.membershipId,plate:legacy.plate}]};
    const provenance={datasetId:runId,checkpoint:manifest.checkpoint};
    async function snapshot(schema=null,origin=provenance){
      if(schema!==null)assert.match(schema,/^recovery_case_[a-z_]+$/);
      const publicSchema=schema||'public',receiptSchema=schema||'vehicle_link_private';
      return ctx.options.reader.snapshot(async tx=>{
        readTransactions++;
        assert.equal((await tx.$queryRawUnsafe('SHOW transaction_read_only'))[0].transaction_read_only,'on');
        assert.equal((await tx.$queryRawUnsafe('SHOW transaction_isolation'))[0].transaction_isolation,'repeatable read');
        async function select(sql,...args){assert.match(sql,/^SELECT /);statements.push(sql);return tx.$queryRawUnsafe(sql,...args);}
        const receipts=await select('SELECT * FROM "'+receiptSchema+'"."SuccessReceipt" WHERE "callerNamespace"=$1 OR "userId"=ANY($2::uuid[])',ns,subjects.map(s=>s.userId));
        const allVehicles=await select('SELECT id,plate,label,"membershipId" FROM "'+publicSchema+'"."Vehicle"');
        const vehicles=allVehicles.filter(v=>subjects.some(s=>s.membershipId===v.membershipId)||receipts.some(r=>r.vehicleId===v.id)||expected.some(e=>e.receipt?.vehicleId===v.id)||v.id===legacy.id);
        const memberIds=new Set([...subjects.map(s=>s.membershipId),...receipts.map(r=>r.membershipId),...vehicles.map(v=>v.membershipId)]);
        const memberships=(await select('SELECT id,"userId",status FROM "'+publicSchema+'"."Membership"')).filter(m=>memberIds.has(m.id));
        const userIds=new Set([...subjects.map(s=>s.userId),...memberships.map(s=>s.userId),...receipts.map(r=>r.userId)]);
        const users=(await select('SELECT id,active FROM "'+publicSchema+'"."User"')).filter(u=>userIds.has(u.id));
        return{receipts,vehicles,memberships,users,provenance:origin};
      });
    }
    const inspector=(schema=null,m=manifest,origin=provenance)=>new VehicleRecoveryInspector({synthetic:true,snapshot:()=>snapshot(schema,origin),manifest:m,normalizers:ctx.normalizers});
    async function authorize(i,c){const actor=await authorization.authenticate(credentials[i]);assert.equal(actor.userId,subjects[i].userId);
      if(!actor.permissions.includes('vehicle:link:own')||c.expectedMembershipId!==subjects[i].membershipId)throw new RecoveryError('DENIED');}
    function execute(q,i,c,diagnostic=inspector()){
      return q.execute({authorize:()=>authorize(i,c),inspector:diagnostic,submit:()=>facade.submit(credentials[i],c)});
    }
    assert.equal((await inspector().inspect()).classification,'CONSISTENT');
    // A healthy gate admits an actual new operation; same-owner legacy link is no-op.
    const healthy=control('healthy',true),publicBeforePositive=await ctx.state('public');
    const newOperation=command(0,prior.plate,'Second different requested label');
    const positive=await execute(healthy,0,newOperation);
    assert.deepEqual(await ctx.state('public'),publicBeforePositive);
    expected.push({userId:subjects[0].userId,command:newOperation,acknowledged:true,receipt:positive.receipt});
    // Updating this trusted fixture manifest is explicit harness setup, not automatic recovery.
    manifest=JSON.parse(JSON.stringify(manifest));
    fs.writeFileSync('/control/fixture-manifest.json',JSON.stringify(manifest),{flag:'wx',mode:0o600});
    const mainBefore=await ctx.state('public'),receiptsBefore=await ctx.state('vehicle_link_private');
    const countsBefore=ctx.counts();
    const coherent=await inspector().inspect();assert.equal(coherent.classification,'CONSISTENT');
    assert.ok(coherent.findings.some(f=>f.code==='DECLARED_LEGACY_WITHOUT_RECEIPT'));
    assert.deepEqual((await execute(healthy,0,manifest.expected[0].command)).receipt,manifest.expected[0].receipt);
    assert.equal(ctx.counts().workCalls,countsBefore.workCalls);
    pass('coherent actual Vehicle/receipt, declared legacy link and persisted-label difference; healthy gate admits only through real Backend repository');
    await assert.rejects(execute(healthy,0,{...manifest.expected[0].command,label:'Wrong reuse'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
    assert.equal((await inspector().inspect()).classification,'CONSISTENT');
    pass('actual wrong key reuse is rejected without corrupting state or triggering a false corruption claim');

    async function copyCase(name){const schema='recovery_case_'+name;assert.match(schema,/^recovery_case_[a-z_]+$/);
      // Explicit partial-restore simulation copies. No original receipt/Vehicle UPDATE/DELETE.
      await ctx.admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');
      for(const table of ['Vehicle','Membership','User'])await ctx.admin.$executeRawUnsafe('CREATE TABLE "'+schema+'"."'+table+'" AS SELECT * FROM public."'+table+'"');
      await ctx.admin.$executeRawUnsafe('CREATE TABLE "'+schema+'"."SuccessReceipt" AS SELECT * FROM vehicle_link_private."SuccessReceipt"');
      await ctx.admin.$executeRawUnsafe('GRANT USAGE ON SCHEMA "'+schema+'" TO a4_legacy_reader');
      await ctx.admin.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA "'+schema+'" TO a4_legacy_reader');
      return schema;
    }
    async function copyHash(schema){return ctx.admin.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const rows={};
      for(const t of ['Vehicle','Membership','User','SuccessReceipt'])rows[t]=(await tx.$queryRawUnsafe('SELECT row_to_json(t) AS data FROM "'+schema+'"."'+t+'" t')).map(r=>JSON.stringify(r.data)).sort();
      return hash(rows);},{isolationLevel:'RepeatableRead'});}
    const first=manifest.expected[0],second=manifest.expected[1],persisted={};
    const definitions=[
      ['missing_vehicle','INCONSISTENT','RECEIPT_WITHOUT_VEHICLE',async s=>ctx.admin.$executeRawUnsafe('DELETE FROM "'+s+'"."Vehicle" WHERE id=$1::uuid',first.receipt.vehicleId)],
      ['missing_receipt','INCONSISTENT','EXPECTED_SUCCESS_RECEIPT_MISSING',async s=>ctx.admin.$executeRawUnsafe('DELETE FROM "'+s+'"."SuccessReceipt" WHERE "operationId"=$1::uuid',first.command.operationId)],
      ['digest','INCONSISTENT','DIGEST_MISMATCH',async s=>ctx.admin.$executeRawUnsafe('UPDATE "'+s+'"."SuccessReceipt" SET "requestDigest"=$1 WHERE "operationId"=$2::uuid','d'.repeat(64),first.command.operationId)],
      ['reused_key','INCONSISTENT','DUPLICATE_OPERATION_KEY',async s=>{await ctx.admin.$executeRawUnsafe('INSERT INTO "'+s+'"."SuccessReceipt" SELECT * FROM "'+s+'"."SuccessReceipt" WHERE "operationId"=$1::uuid',first.command.operationId);
        await ctx.admin.$executeRawUnsafe('UPDATE "'+s+'"."SuccessReceipt" SET "requestDigest"=$1 WHERE "operationId"=$2::uuid','e'.repeat(64),first.command.operationId);}],
      ['namespace','INCONSISTENT','NAMESPACE_MISMATCH',async s=>ctx.admin.$executeRawUnsafe('UPDATE "'+s+'"."SuccessReceipt" SET "callerNamespace"=$1 WHERE "operationId"=$2::uuid','wrong-caller',first.command.operationId)],
      ['operation','INCONSISTENT','EXPECTED_SUCCESS_RECEIPT_MISSING',async s=>ctx.admin.$executeRawUnsafe('UPDATE "'+s+'"."SuccessReceipt" SET "operationId"=$1::uuid WHERE "operationId"=$2::uuid',randomUUID(),first.command.operationId)],
      ['uuid','INCONSISTENT','RECEIPT_WITHOUT_VEHICLE',async s=>ctx.admin.$executeRawUnsafe('UPDATE "'+s+'"."SuccessReceipt" SET "vehicleId"=$1::uuid WHERE "operationId"=$2::uuid',randomUUID(),first.command.operationId)],
      ['owner','INCONSISTENT','VEHICLE_BINDING_MISMATCH',async s=>ctx.admin.$executeRawUnsafe('UPDATE "'+s+'"."Vehicle" SET "membershipId"=$1::uuid WHERE id=$2::uuid',subjects[1].membershipId,first.receipt.vehicleId)],
      ['subject','INCONSISTENT','RECEIPT_SUBJECT_MISMATCH',async s=>ctx.admin.$executeRawUnsafe('UPDATE "'+s+'"."SuccessReceipt" SET "userId"=$1::uuid WHERE "operationId"=$2::uuid',subjects[1].userId,first.command.operationId)],
      ['partial','INCONSISTENT','SOURCE_CUT_MISMATCH',async s=>{await ctx.admin.$executeRawUnsafe('DELETE FROM "'+s+'"."SuccessReceipt" WHERE "operationId"=$1::uuid',first.command.operationId);
        await ctx.admin.$executeRawUnsafe('DELETE FROM "'+s+'"."Vehicle" WHERE id=$1::uuid',second.receipt.vehicleId);}],
      ['unattributed','INDETERMINATE','UNATTRIBUTED_LINK',async s=>ctx.admin.$executeRawUnsafe('UPDATE "'+s+'"."Vehicle" SET plate=$1 WHERE id=$2::uuid','UNK-201',legacy.id)],
    ];
    for(const[name,classification,code,mutate]of definitions){
      const schema=await copyCase(name);await mutate(schema);const before=await copyHash(schema);
      const i=inspector(schema,manifest,name==='partial'?{datasetId:runId,checkpoint:'simulated-mixed-cuts'}:provenance);
      const report=await i.inspect();assert.equal(report.classification,classification);assert.ok(report.findings.some(f=>f.code===code));
      const q=control(name,true),beforeCalls=ctx.counts();assert.equal((await q.assess(i)).admission,'QUARANTINED');
      await assert.rejects(execute(q,0,command(0,'BLK-001'),i),blocked);assert.deepEqual(ctx.counts(),beforeCalls);
      const after=await copyHash(schema);assert.equal(after,before);
      cases.push({name,classification,codes:[...new Set(report.findings.map(f=>f.code))],beforeHash:before,afterHash:after,blockedBeforeRepository:true});
      if(name==='missing_vehicle')persisted[name]=hash(fs.readFileSync('/control/'+name+'/quarantine.json','utf8'));
    }
    pass('eleven SQL fixture-copy fault cases: missing receipt/link, digest/key/namespace/UUID/owner/subject mismatch, partial restore, unattributed link; no diagnostic writes');

    const unattested=inspector(null,manifest,null),u=await unattested.inspect();assert.equal(u.classification,'INDETERMINATE');
    assert.ok(u.findings.some(f=>f.code==='CONTINUITY_UNATTESTED'));
    const unknown=JSON.parse(JSON.stringify(manifest));unknown.expected=[];
    assert.equal((await inspector(null,unknown).inspect()).classification,'INDETERMINATE');
    pass('missing continuity or original intentions remain indeterminate rather than invented success or corruption');

    const api=new PrivateRecoveryDiagnostics({synthetic:true,inspector:inspector(),authorization});
    const own=await api.lookup(credentials[0],first.command.operationId);assert.equal(own.classification,'CONSISTENT');
    assert.deepEqual(await api.lookup(credentials[1],first.command.operationId),await api.lookup(credentials[1],randomUUID()));
    assert.ok(!JSON.stringify(own).includes(subjects[1].userId));
    await assert.rejects(api.lookup({kind:'member',userId:subjects[0].userId},first.command.operationId),e=>e.code==='DENIED');
    await assert.rejects(api.inspect(credentials[0]),e=>e.code==='DENIED');
    assert.equal((await api.inspect(reconcilerCredential)).classification,'CONSISTENT');
    const latched=control('missing_vehicle');
    assert.equal((await latched.assess(inspector())).admission,'QUARANTINED');
    assert.equal((await api.lookup(credentials[0],first.command.operationId)).classification,'CONSISTENT');
    assert.equal(hash(fs.readFileSync('/control/missing_vehicle/quarantine.json','utf8')),persisted.missing_vehicle);
    pass('owner isolation and read diagnostics while quarantined; healthy reinspection cannot clear sticky quarantine');
    for(const sql of ['UPDATE public."Vehicle" SET label=label','DELETE FROM vehicle_link_private."SuccessReceipt"','UPDATE recovery_case_digest."SuccessReceipt" SET label=label'])
      await assert.rejects(ctx.reader.$executeRawUnsafe(sql),e=>['42501','25006'].includes(e.meta?.code));
    assert.ok(statements.every(s=>s.startsWith('SELECT ')));
    assert.deepEqual(await ctx.state('public'),mainBefore);assert.deepEqual(await ctx.state('vehicle_link_private'),receiptsBefore);
    pass('SELECT role plus READ ONLY/RepeatableRead, original complete public/private datasets identical after diagnostics and negative commands');

    // Explicit uncommitted provider transaction outside the admission gate, coordinated by barriers.
    const inFlight=command(0,'INV-901');let enter,release;
    const ready=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
    const heldWriter={atomic:work=>ctx.writer.atomic(async tx=>{const value=await work(tx);enter();await wait;return value;})};
    const held=new ctx.classes.VehicleSuccessAuthority({...ctx.options,callerNamespace:ns,writer:heldWriter});
    const running=held.submit(subjects[0].userId,inFlight);let readyTimer;
    const pending=JSON.parse(JSON.stringify(manifest));pending.expected.push({userId:subjects[0].userId,command:inFlight,acknowledged:false});
    const pendingInspector=inspector(null,pending),q=control('inflight',true);let runningResult;
    try{
      await Promise.race([ready,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(Error('BARRIER_TIMEOUT')),5000);})]);
      const r=await pendingInspector.inspect();assert.equal(r.classification,'INDETERMINATE');assert.ok(r.findings.some(f=>f.code==='NOT_OBSERVED'));
      assert.equal((await q.assess(pendingInspector)).admission,'QUARANTINED');const beforeCalls=ctx.counts();
      await assert.rejects(execute(q,0,command(0,'BLK-002'),pendingInspector),blocked);assert.deepEqual(ctx.counts(),beforeCalls);
      cases.push({name:'inflight_absence',classification:r.classification,codes:[...new Set(r.findings.map(f=>f.code))],blockedBeforeRepository:true});
    }finally{clearTimeout(readyTimer);release();runningResult=await running;}
    pending.expected[pending.expected.length-1]={userId:subjects[0].userId,command:inFlight,acknowledged:true,receipt:runningResult.receipt};
    const settled=await inspector(null,pending).inspect();assert.equal(settled.classification,'CONSISTENT');
    assert.equal((await q.assess(inspector(null,pending))).admission,'QUARANTINED');
    await assert.rejects(execute(q,0,command(0,'BLK-003'),inspector(null,pending)),blocked);
    persisted.inflight=hash(fs.readFileSync('/control/inflight/quarantine.json','utf8'));
    pass('real concurrent uncommitted absence is indeterminate; quarantine persists after original uncontrolled transaction commits and new commands stay blocked');
    const mainAfter=await ctx.state('public');
    for(const name of Object.keys(mainBefore).filter(n=>n!=='Vehicle'))assert.deepEqual(mainAfter[name],mainBefore[name],name+' changed');
    for(const row of mainBefore.Vehicle)assert.ok(mainAfter.Vehicle.includes(row));
    assert.equal(mainAfter.Vehicle.length,mainBefore.Vehicle.length+1);
    assert.equal(await ctx.admin.vehicle.count({where:{plate:{in:['BLK-001','BLK-002','BLK-003']}}}),0);
    fs.writeFileSync('/control/latch-evidence.json',JSON.stringify({datasetId:runId,hashes:persisted}),{flag:'wx',mode:0o600});
    pass('all 39 non-Vehicle public tables and every historical Vehicle row/UUID preserved; only deliberate in-flight link added, no financial replay or repair');
    console.log(JSON.stringify({success:true,checks,cases,readTransactions,diagnosticSelects:statements.length,
      quarantineMarkers:persisted,originalPublicHashBefore:ctx.hash(mainBefore),originalPublicHashAfter:ctx.hash(mainAfter),
      originalReceiptHashBefore:ctx.hash(receiptsBefore),nonVehicleTablesUnchanged:Object.keys(mainBefore).filter(n=>n!=='Vehicle').length,
      limitations:{fixtureManifestOnly:true,copyRestoreSimulation:true,globalFence:false,externalWritersBlocked:false,publicIntegration:false,JWT:false,retention:false,automaticRepair:false}}));
  }finally{await ctx.close();}
})().catch(error=>{process.stderr.write(JSON.stringify({code:error.code||'ERROR',message:String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[private-url]').slice(-4000)})+'\n');process.exitCode=1;});
