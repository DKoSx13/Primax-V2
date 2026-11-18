const assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const{randomUUID}=require('node:crypto');
module.exports=async function({fixtures,service,pass,admin}){
  const ctx=await require('./identity-a4-vehicle-receipt-support.cjs')();
  const legacyAdmin=ctx.admin;
  const reject=(promise,code)=>assert.rejects(promise,error=>error.code===code&&error.message===code);
  try{
    assert.equal(fixtures.length, 4);
    for (const [index, fixture] of fixtures.entries()) {
      await legacyAdmin.user.create({ data: { id: fixture.userId, active: index !== 3,
        name: "Synthetic vehicle owner", email: `owner-${index}@synthetic.invalid`, passwordHash: "synthetic-not-a-login-hash" } });
      await legacyAdmin.membership.create({ data: { id: fixture.membershipId, userId: fixture.userId, number: fixture.number,
        status: index === 2 ? "SUSPENDED" : "ACTIVE", balance: "91.25", welcomeAvailable: true,
        welcomeReservedOperationId: randomUUID(), codeAliases: { create: fixture.aliases.map(code => ({ code })) } } });
    }
    const owned = await legacyAdmin.vehicle.create({ data: { plate: "OWN-001", label: "Original owned label", membershipId: fixtures[0].membershipId } });
    const foreign = await legacyAdmin.vehicle.create({ data: { plate: "FOR-001", label: "Synthetic foreign", membershipId: fixtures[1].membershipId } });
    const guest = await legacyAdmin.vehicle.create({ data: { plate: "GUE-001", label: "Historical guest", membershipId: null } });
    const contested = await legacyAdmin.vehicle.create({ data: { plate: "RAC-002", label: "Unowned race", membershipId: null } });
    const deniedOwned = [];
    for (const index of [2, 3]) deniedOwned.push(await legacyAdmin.vehicle.create({ data: {
      plate: "DOW-00" + index, label: "Historical denied owner", membershipId: fixtures[index].membershipId } }));
    const station = await legacyAdmin.station.create({ data: { code: "SYNTHETIC", name: "Synthetic", address: "Synthetic fixture" } });
    const fuel = await legacyAdmin.fuel.create({ data: { code: "SYNTHETIC", name: "Synthetic", pricePerGallon: "10.00" } });
    const transaction = data => legacyAdmin.transaction.create({ data: { operationId: randomUUID(), requestHash: "a".repeat(64),
      stationId: station.id, fuelId: fuel.id, amount: "12.50", unitPrice: "10.00", pointsRate: "1.00", pointsEarned: 17,
      mode: "POSTPAGO", ...data } });
    const memberPurchase = await transaction({ plate: owned.plate, vehicleId: owned.id, membershipId: fixtures[0].membershipId });
    const guestPurchase = await transaction({ plate: guest.plate, vehicleId: guest.id, membershipId: null, mode: "PREPAGO", pointsEarned: 0 });
    await legacyAdmin.membershipDebt.create({ data: { membershipId: fixtures[0].membershipId, transactionId: memberPurchase.id,
      amountOriginal: "12.50", amountPending: "12.50" } });
    await legacyAdmin.rewardMovement.create({ data: { membershipId: fixtures[0].membershipId, transactionId: memberPurchase.id, kind: "EARN", points: 17 } });
    const guestAuthorization = await legacyAdmin.fuelAuthorization.create({ data: { operationId: randomUUID(), requestHash: "b".repeat(64),
      stationId: station.id, fuelId: fuel.id, plate: guest.plate, vehicleId: guest.id, membershipId: null,
      authorizedAmount: "10.00", reservedAmount: "0.00", balanceAfter: "0.00", mode: "PREPAGO" } });
    const command=(i,plate,label="Synthetic requested")=>({contractVersion:2,operationId:randomUUID(),expectedMembershipId:fixtures[i].membershipId,plate,label});
    const historical=[];
    // Already-ineligible historical fixtures. No status/active UPDATE is performed.
    for(const i of [2,3]){
      const c=command(i,"DOW-00"+i),p=ctx.classes.prepare(fixtures[i].userId,c,ctx.options.callerNamespace,ctx.normalizers,ctx.contract.DurableLinkError);
      await legacyAdmin.$executeRawUnsafe(`INSERT INTO vehicle_link_private."SuccessReceipt"
        ("callerNamespace","operationId","userId","membershipId","vehicleId","requestDigest","contractVersion","policyVersion",plate,label)
        VALUES ($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,2,'SUCCESS_ONLY_V1',$7,$8)`,ctx.options.callerNamespace,c.operationId,
      fixtures[i].userId,fixtures[i].membershipId,deniedOwned[i-2].id,p.digest,p.plate,deniedOwned[i-2].label);
      historical.push(c);
    }
    const before=await ctx.state("public"),beforeReceipts=await ctx.state("vehicle_link_private");
    async function a4State(){const result={};for(const table of ["AccountReference","MembershipIdentity","MembershipCode","MembershipNumberCounter","AllocationReceipt"])
      result[table]=(await admin.$queryRawUnsafe(`SELECT row_to_json(t) AS data FROM identity_a4_private."${table}" t`)).map(r=>JSON.stringify(r.data)).sort();return result;}
    const beforeA4=await a4State();
    const credentials=fixtures.map(()=>randomUUID()),grants=fixtures.map(()=>["vehicle:link:own","vehicle:result:own"]);
    const authorization={async authenticate(key){const i=credentials.indexOf(key);if(i<0)throw new ctx.contract.DurableLinkError("DENIED","NOT_SENT");
      return{kind:"member",userId:fixtures[i].userId,permissions:[...grants[i]]};}};
    const application=(commands=ctx.authority,queries=ctx.resultReader)=>new ctx.contract.PrivateDurableVehicleLink(authorization,service,commands,queries,{synthetic:true});
    const facade=application();
    const first=command(0,"NEW-001"),success=await facade.submit(credentials[0],first);
    assert.equal(success.status,"COMMITTED");
    const workAfterSuccess=ctx.counts().workCalls;
    for(let i=0;i<5;i++)assert.deepEqual(await facade.lookup(credentials[0],first.operationId),success);
    assert.deepEqual(await facade.submit(credentials[0],first),success);
    assert.equal(ctx.counts().workCalls,workAfterSuccess);
    assert.equal((await ctx.admin.vehicle.findUnique({where:{plate:first.plate}})).id,success.receipt.vehicleId);
    await reject(facade.submit(credentials[1],{...first,expectedMembershipId:fixtures[1].membershipId,plate:"OTH-001"}),"IDEMPOTENCY_CONFLICT");
    assert.equal(await ctx.admin.vehicle.count({where:{plate:"OTH-001"}}),0);
    pass("4B.1 receipt and Vehicle commit together; lookups and duplicate success bypass legacy link work and preserve UUID/result");
    const adopted=await facade.submit(credentials[0],command(0,guest.plate,"Guest link"));assert.equal(adopted.receipt.vehicleId,guest.id);
    const unchanged=await facade.submit(credentials[0],command(0,owned.plate,"Ignored new label"));assert.equal(unchanged.receipt.label,owned.label);

    function writerWithHook(hook){return{atomic:work=>ctx.writer.atomic(async tx=>work(new Proxy(tx,{get(target,key){
      if(key==="$queryRawUnsafe")return async(...args)=>{const value=await target.$queryRawUnsafe(...args);await hook(args,value);return value;};
      return target[key];}})))};}
    function receiptRace(operationId){let arrivals=0,release;const barrier=new Promise(r=>{release=r;});
      return writerWithHook(async(args,rows)=>{if(args[0].startsWith('SELECT * FROM vehicle_link_private.')&&args[2]===operationId&&rows.length===0){
        arrivals++;if(arrivals===2)release();if(arrivals<=2){let timer;try{await Promise.race([barrier,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("BARRIER_TIMEOUT")),3000);})]);}finally{clearTimeout(timer);}}}});}
    const duplicate=command(0,"DUP-001");
    const duplicateAuthority=new ctx.classes.VehicleSuccessAuthority({...ctx.options,writer:receiptRace(duplicate.operationId)});
    const duplicates=await Promise.all([application(duplicateAuthority).submit(credentials[0],duplicate),application(duplicateAuthority).submit(credentials[0],duplicate)]);
    assert.deepEqual(duplicates[0],duplicates[1]);assert.equal(await ctx.admin.vehicle.count({where:{plate:duplicate.plate}}),1);
    await reject(facade.submit(credentials[0],{...duplicate,label:"Different intention"}),"IDEMPOTENCY_CONFLICT");
    const different=command(0,"DIF-001"),differentAuthority=new ctx.classes.VehicleSuccessAuthority({...ctx.options,writer:receiptRace(different.operationId)});
    const raced=await Promise.allSettled([application(differentAuthority).submit(credentials[0],different),
      application(differentAuthority).submit(credentials[0],{...different,plate:"DIF-002"})]);
    assert.equal(raced.filter(r=>r.status==="fulfilled").length,1);assert.equal(raced.find(r=>r.status==="rejected").reason.code,"IDEMPOTENCY_CONFLICT");
    assert.equal(await ctx.admin.vehicle.count({where:{plate:{in:["DIF-001","DIF-002"]}}}),1);
    pass("4B.1 same-key concurrent requests recover one result; changed digests conflict and losing different-plate work rolls back");
    const ownerRace=await Promise.allSettled([facade.submit(credentials[0],command(0,"OWN-002")),facade.submit(credentials[1],command(1,"OWN-002"))]);
    assert.equal(ownerRace.filter(r=>r.status==="fulfilled").length,1);assert.equal(ownerRace.find(r=>r.status==="rejected").reason.code,"OWNERSHIP_CONFLICT");
    assert.equal(await ctx.admin.vehicle.count({where:{plate:"OWN-002"}}),1);
    pass("4B.1 distinct owners remain exclusive under original Backend link/Serializable/UNIQUE, without a second Vehicle writer");

    for(const phase of ["before-receipt","after-receipt"]){const c=command(0,phase==="before-receipt"?"ROL-001":"ROL-002");
      const writer=phase==="before-receipt"?{atomic:work=>ctx.writer.atomic(tx=>work(new Proxy(tx,{get(target,key){
        if(key==="$queryRawUnsafe")return(sql,...values)=>{if(sql.startsWith('INSERT INTO vehicle_link_private.'))throw Error("synthetic abort before receipt");return target.$queryRawUnsafe(sql,...values);};return target[key];}})))}:
        {atomic:work=>ctx.writer.atomic(async tx=>{await work(tx);throw Error("synthetic abort after receipt");})};
      await reject(application(new ctx.classes.VehicleSuccessAuthority({...ctx.options,writer})).submit(credentials[0],c),"OUTCOME_UNKNOWN");
      assert.equal(await ctx.admin.vehicle.count({where:{plate:c.plate}}),0);
      assert.deepEqual(await facade.lookup(credentials[0],c.operationId),{status:"NOT_OBSERVED"});
    }
    pass("4B.1 failures before receipt insertion or after both writes roll back Vehicle and receipt atomically");
    const notSent=command(0,"OFF-001");
    await reject(application({submit:async()=>{throw new ctx.contract.DurableLinkError("UNAVAILABLE","NOT_SENT");}}).submit(credentials[0],notSent),"UNAVAILABLE");
    assert.equal(await ctx.admin.vehicle.count({where:{plate:notSent.plate}}),0);

    async function child(mode,input){return new Promise((resolve,reject)=>{
      const processChild=cp.fork(path.join(ctx.root,"tools/astra/identity-a4-vehicle-receipt-process.cjs"),[mode],{env:process.env,stdio:["ignore","pipe","pipe","ipc"]});
      let value,committed=false,detail="";processChild.stdout.resume();processChild.stderr.on("data",b=>{detail+=String(b).slice(-1000);});
      const timer=setTimeout(()=>{processChild.kill("SIGKILL");reject(Error("OWN_CHILD_TIMEOUT"));},20000);
      processChild.on("message",message=>{if(message.phase===(mode==="abort-wait"?"BEFORE_COMMIT":"AFTER_COMMIT")){committed=true;processChild.kill("SIGKILL");}
        else if(message.error){clearTimeout(timer);reject(Object.assign(Error(message.error.code),message.error));}else value=message.result;});
      processChild.on("error",error=>{clearTimeout(timer);reject(error);});
      processChild.on("exit",(code,signal)=>{clearTimeout(timer);if(mode!=="lookup"&&committed&&signal==="SIGKILL")resolve({pid:processChild.pid,killedAfterCommit:mode==="commit-wait"});
        else if(code===0&&value)resolve({pid:processChild.pid,result:value});else reject(Error("OWN_CHILD_FAILED:"+detail.slice(-500)));});
      processChild.send(input);
    });}
    const aborted=command(0,"CRS-001");
    const crashed=application({async submit(userId,c){await child("abort-wait",{userId,command:c});throw Error("provider killed before commit");}});
    await reject(crashed.submit(credentials[0],aborted),"OUTCOME_UNKNOWN");
    assert.deepEqual(await facade.lookup(credentials[0],aborted.operationId),{status:"NOT_OBSERVED"});
    assert.equal(await ctx.admin.vehicle.count({where:{plate:aborted.plate}}),0);
    const lost=command(0,"LOS-001");let lostProcess;
    const lostApplication=application({async submit(userId,c){lostProcess=await child("commit-wait",{userId,command:c});throw Error("provider terminated after commit; no result delivered");}});
    await reject(lostApplication.submit(credentials[0],lost),"OUTCOME_UNKNOWN");
    const lookupInput={userId:fixtures[0].userId,expectedMembershipId:fixtures[0].membershipId,operationId:lost.operationId};
    const recovered=await child("lookup",lookupInput),restarted=await child("lookup",lookupInput);
    assert.notEqual(lostProcess.pid,recovered.pid);assert.notEqual(recovered.pid,restarted.pid);
    assert.deepEqual(recovered.result,restarted.result);assert.deepEqual(await facade.lookup(credentials[0],lost.operationId),recovered.result);
    assert.deepEqual(await facade.submit(credentials[0],lost),recovered.result);
    assert.equal(await ctx.admin.vehicle.count({where:{plate:lost.plate}}),1);
    pass("4B.1 provider killed before commit leaves no effect; killed after commit before delivering result, two new processes recover identical receipt/UUID without linking");

    let signalReady,release;const ready=new Promise(r=>{signalReady=r;}),wait=new Promise(r=>{release=r;});
    const inFlight=command(0,"FLY-001"),heldWriter={atomic:work=>ctx.writer.atomic(async tx=>{const result=await work(tx);signalReady();await wait;return result;})};
    const heldPromise=application(new ctx.classes.VehicleSuccessAuthority({...ctx.options,writer:heldWriter})).submit(credentials[0],inFlight);
    let readyTimer;try{await Promise.race([ready,new Promise((_,r)=>{readyTimer=setTimeout(()=>r(Error("READY_TIMEOUT")),4000);})]);
      assert.deepEqual(await facade.lookup(credentials[0],inFlight.operationId),{status:"NOT_OBSERVED"});
    }finally{clearTimeout(readyTimer);release();}
    const heldResult=await heldPromise;assert.deepEqual(await facade.lookup(credentials[0],inFlight.operationId),heldResult);
    const unavailableReader={lookup:async()=>{throw Error("synthetic result provider failure");}};
    await reject(application(ctx.authority,unavailableReader).lookup(credentials[0],first.operationId),"UNAVAILABLE");
    pass("4B.1 NOT_OBSERVED during an uncommitted successful operation is not rollback; unavailable lookup never fabricates absence");

    await reject(facade.lookup({userId:fixtures[0].userId},first.operationId),"DENIED");
    assert.deepEqual(await facade.lookup(credentials[1],first.operationId),{status:"NOT_OBSERVED"});
    assert.deepEqual(await facade.lookup(credentials[1],randomUUID()),{status:"NOT_OBSERVED"});
    grants[0]=[];await reject(facade.lookup(credentials[0],first.operationId),"DENIED");grants[0]=["vehicle:link:own","vehicle:result:own"];
    for(const i of [2,3]){await assert.rejects(facade.lookup(credentials[i],historical[i-2].operationId),e=>e.code==="DENIED"&&e.outcome==="UNKNOWN");
      await reject(facade.submit(credentials[i],historical[i-2]),"DENIED");
      await reject(facade.submit(credentials[i],command(i,"DEN-00"+i)),"DENIED");}
    pass("4B.1 unauthorized/foreign lookup cannot reveal receipts; prior suspension/inactivity and capability revocation do not gain permission from success history");
    await assert.rejects(ctx.writer.$executeRawUnsafe('UPDATE vehicle_link_private."SuccessReceipt" SET label=label'),e=>e.meta?.code==="42501");
    await assert.rejects(ctx.reader.$executeRawUnsafe('DELETE FROM vehicle_link_private."SuccessReceipt"'),e=>e.meta?.code==="42501"||e.meta?.code==="25006");
    await assert.rejects(ctx.admin.$executeRawUnsafe('UPDATE vehicle_link_private."SuccessReceipt" SET label=label'),e=>e.meta?.code==="55000");
    await assert.rejects(ctx.writer.$executeRawUnsafe('UPDATE public."Membership" SET balance=0'),e=>e.meta?.code==="42501");
    await assert.rejects(ctx.admin.$executeRawUnsafe(`INSERT INTO vehicle_link_private."SuccessReceipt"
      ("callerNamespace","operationId","userId","membershipId","vehicleId","requestDigest","contractVersion","policyVersion",plate,label)
      VALUES ($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,2,'SUCCESS_ONLY_V1','BAD-001','Synthetic')`,ctx.options.callerNamespace,randomUUID(),
    fixtures[0].userId,fixtures[0].membershipId,randomUUID(),"f".repeat(64)),e=>e.meta?.code==="23503");
    const after=await ctx.state("public");for(const name of Object.keys(before).filter(name=>name!=="Vehicle"))assert.deepEqual(after[name],before[name],name+" changed");
    assert.deepEqual(await a4State(),beforeA4);
    assert.equal((await ctx.admin.transaction.findUnique({where:{id:guestPurchase.id}})).membershipId,null);
    assert.equal((await ctx.admin.fuelAuthorization.findUnique({where:{id:guestAuthorization.id}})).membershipId,null);
    for(const row of [owned,foreign,...deniedOwned])assert.deepEqual(await ctx.admin.vehicle.findUnique({where:{id:row.id}}),row);
    const receiptState=await ctx.state("vehicle_link_private");assert.ok(receiptState.SuccessReceipt.length>beforeReceipts.SuccessReceipt.length);
    const allRows=await ctx.admin.$queryRawUnsafe('SELECT * FROM vehicle_link_private."SuccessReceipt" ORDER BY "operationId"');
    const receipts=[];for(const row of allRows.filter(r=>fixtures.slice(0,2).some(f=>f.userId===r.userId))){
      const result=await ctx.resultReader.lookup({userId:row.userId,expectedMembershipId:row.membershipId,operationId:row.operationId});assert.equal(result.status,"COMMITTED");receipts.push(result.receipt);}
    pass("4B.1 success receipts are immutable; all 39 legacy non-Vehicle tables, historical guest references and five A4 tables unchanged");
    return{manifest:{publicHash:ctx.hash(after),receiptHash:ctx.hash(receiptState),receipts},checksSummary:{...ctx.counts(),
      successfulReceipts:allRows.length,authorizedReceiptsForRecovery:receipts.length,historicalIneligibleFixtures:historical.length,
      providerKilledAfterCommit:true,freshLookupProcesses:2,negativeDigestRace:true,financialTablesUnchanged:39,
      physicalStorageLossTested:false,concurrentSuspensionPriorityTested:false,publicHTTP:false,authentication:"synthetic opaque credentials, no AuthCore/JWT"}};
  }finally{await ctx.close();}
};
