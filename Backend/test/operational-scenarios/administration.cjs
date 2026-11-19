module.exports=async c=>{
  const {assert,db,id,call,snapshot,rollback,lose,flags,seedOperation}=c,b='/api/v1/operational-admin';
  const endpoints=[['permissions/admin',{userId:id('target'),reason:'Synthetic grant'},'grantAdmin'],['permissions/admin/'+id('absent-grant')+'/revoke',{},'revokeAdminGrant'],['pumps',{stationId:id('station-A'),code:'NEW-PUMP',name:'Synthetic'},'createPump'],['terminals',{stationId:id('station-A'),code:'NEW-TERMINAL'},'createTerminal'],['terminals/'+id('main-terminal')+'/assign-pump',{pumpId:id('race-pump')},'assignTerminal'],['terminal-pump-assignments/'+id('main-assignment')+'/end',{},'endTerminalAssignment'],['terminals/'+id('lost-terminal')+'/revoke',{},'revokeTerminal']];
  const post=(index,status,label,o={})=>{const [route,body,method]=endpoints[index];return call('POST',b+'/'+(o.route||route),status,label,{body,engine:'operations.'+method,...o});};
  const initialInventory=await db.inventoryMovement.count();
  const initial=await snapshot();
  for(let i=0;i<endpoints.length;i++)for(const [actor,status]of [['anonymous',401],['member',403],['manager',403],['invalid',401],['expired',401],['legacy',401],['cookie',401]])await post(i,status,endpoints[i][2]+' denies '+actor,{actor,noEngine:true});
  await post(0,400,'grant invalid DTO',{body:{userId:'bad',reason:'x'},noEngine:true});
  await post(0,404,'grant absent user',{body:{userId:id('absent-user'),reason:'Synthetic'}});
  await post(0,404,'grant inactive user',{body:{userId:id('inactive'),reason:'Synthetic'}});
  await post(2,400,'pump invalid code',{body:{stationId:id('station-A'),code:'bad space',name:'Synthetic'},noEngine:true});
  await post(2,404,'pump missing station',{body:{stationId:id('absent-station'),code:'NEW',name:'Synthetic'}});
  await post(3,404,'terminal missing station',{body:{stationId:id('absent-station'),code:'NEW'}});
  await post(4,400,'assignment foreign station',{body:{pumpId:id('other-pump')}});
  await post(5,409,'cannot unassign available terminal');
  await post(6,404,'revoke absent terminal',{route:'terminals/'+id('absent-terminal')+'/revoke'});
  assert.deepEqual(await snapshot(),initial);
  const grant=await post(0,201,'grant root authority');assert.equal(grant.permission,'SYSTEM_ADMIN');assert.equal(grant.grantedByUserId,id('root'));
  await post(0,409,'duplicate active grant retains conflict');
  await post(2,201,'new grant authorizes target',{actor:'target',body:{stationId:id('station-A'),code:'TARGET-PUMP',name:'Synthetic'}});
  await post(1,201,'revoke grant',{route:'permissions/admin/'+grant.id+'/revoke'});assert((await db.userPermissionGrant.findUniqueOrThrow({where:{id:grant.id}})).revokedAt);
  await post(2,403,'revoked grant removes target authority',{actor:'target',noEngine:true});
  await post(1,404,'revoke repeated remains 404',{route:'permissions/admin/'+grant.id+'/revoke'});
  const pump=await post(2,201,'create pump'),terminal=await post(3,201,'create terminal');assert.equal(pump.stationId,id('station-A'));assert.equal(terminal.lifecycle,'REGISTRADA');
  await post(2,409,'duplicate pump code');await post(3,409,'duplicate terminal code');
  const assignment=await post(4,201,'assign created terminal',{route:'terminals/'+terminal.id+'/assign-pump',body:{pumpId:pump.id}});assert.equal(assignment.assignedByUserId,id('root'));
  await post(4,409,'duplicate active assignment',{route:'terminals/'+terminal.id+'/assign-pump',body:{pumpId:pump.id}});
  await db.terminal.update({where:{id:terminal.id},data:{operationalStatus:'ASISTENCIA'}});
  await post(5,201,'end suspended assignment',{route:'terminal-pump-assignments/'+assignment.id+'/end'});await post(5,404,'end repeated retains 404',{route:'terminal-pump-assignments/'+assignment.id+'/end'});
  const op=await seedOperation('main');const revoked=await post(6,201,'revoke active terminal',{route:'terminals/'+id('main-terminal')+'/revoke'});assert.equal(revoked.lifecycle,'REVOCADA');assert.equal(revoked.operationalStatus,'FUERA_DE_SERVICIO');assert.equal((await db.terminalOperation.findUniqueOrThrow({where:{id:op.id}})).status,'INTERVENTION_REQUIRED');assert((await db.terminalCredential.findUniqueOrThrow({where:{id:id('main-credential')}})).revokedAt);
  let state=await snapshot();await post(6,201,'revoke active terminal replay',{route:'terminals/'+id('main-terminal')+'/revoke'});assert.deepEqual(await snapshot(),state);
  for(const i of [0,2,3,4,5,6]){
    let options={};if(i===0)options.body={userId:id('member'),reason:'Rollback grant'};if(i===2)options.body={stationId:id('station-A'),code:'ROLLBACK-PUMP',name:'Synthetic'};if(i===3)options.body={stationId:id('station-A'),code:'ROLLBACK-TERMINAL'};if(i===4)options={route:'terminals/'+id('unassigned-terminal')+'/assign-pump',body:{pumpId:id('unassigned-pump')}};
    if(i===5){await db.terminal.update({where:{id:id('rollback-terminal')},data:{operationalStatus:'ASISTENCIA'}});options.route='terminal-pump-assignments/'+id('rollback-assignment')+'/end';}if(i===6)options.route='terminals/'+id('cancel-terminal')+'/revoke';
    state=await snapshot();rollback(true);await post(i,500,'rollback '+endpoints[i][2],options);rollback(false);assert.deepEqual(await snapshot(),state);await post(i,201,'explicit retry '+endpoints[i][2],options);
  }
  const rbGrant=await db.userPermissionGrant.findFirstOrThrow({where:{userId:id('member'),revokedAt:null}});state=await snapshot();rollback(true);await post(1,500,'rollback revoke grant',{route:'permissions/admin/'+rbGrant.id+'/revoke'});rollback(false);assert.deepEqual(await snapshot(),state);await post(1,201,'retry revoke grant',{route:'permissions/admin/'+rbGrant.id+'/revoke'});
  lose('operations.revokeTerminal');await post(6,503,'revoke response lost',{route:'terminals/'+id('lost-terminal')+'/revoke'});state=await snapshot();await post(6,201,'revoke retry no extra audit',{route:'terminals/'+id('lost-terminal')+'/revoke'});assert.deepEqual(await snapshot(),state);
  // Creation has no operationId: loss is unknown, repeating the code conflicts rather than inventing replay.
  lose('operations.createPump');await post(2,503,'pump create response unknown',{body:{stationId:id('station-A'),code:'LOST-PUMP',name:'Synthetic'}});state=await snapshot();await post(2,409,'pump retry retains code conflict',{body:{stationId:id('station-A'),code:'LOST-PUMP',name:'Synthetic'}});assert.deepEqual(await snapshot(),state);
  const raceBody={stationId:id('station-A'),code:'RACE-PUMP',name:'Synthetic'};
  const race=await Promise.all(['A','B'].map(()=>post(2,[201,409],'concurrent create pump',{body:raceBody,concurrent:true})));assert.equal(race.filter(x=>x.id).length,1);assert.equal(await db.pump.count({where:{stationId:id('station-A'),code:'RACE-PUMP'}}),1);
  flags.sevenContracts=true;flags.rollbackSevenCommands=true;flags.rootOnlyAndCrossStationRules=true;flags.activeRevokePreservesOperation=true;flags.nonIdempotentCreationUnknownPreserved=true;flags.noFinancialEffects=true;
  assert.equal(await db.transaction.count(),0);assert.equal(await db.walletMovement.count(),0);assert.equal(await db.inventoryMovement.count(),initialInventory);
};
