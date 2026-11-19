module.exports=async c=>{
  const {assert,db,store,id,call,snapshot,rollback,lose,seedOperation,createDemoOrder,flags}=c,b='/api/v1/control/terminal-operations';
  const run=(key,method,status,label,o={})=>call('POST',b+'/'+id(key+'-operation')+'/'+method,status,label,{actor:'manager',body:method==='resolve'?{reason:'Synthetic resolution'}:method==='recovery-ticket'?{reason:'  Synthetic recovery reason  '}:{},engine:method==='recovery-ticket'?'kiosk.issueRecoveryTicket':'operations.'+(method==='resolve'?'resolveOperation':'cancelUnpaidOperation'),...o});
  for(const key of ['main','cancel','resolve','blocked'])await seedOperation(key,key==='resolve'?{status:'INTERVENTION_REQUIRED'}:{});
  const initialInventory=await db.inventoryMovement.count();
  for(const method of ['cancel-unpaid','resolve','recovery-ticket'])for(const [actor,status]of [['anonymous',401],['member',403],['legacy',401],['terminal',403],['invalid',401],['expired',401]])await run('main',method,status,method+' denies '+actor,{actor,noEngine:true});
  await run('main','cancel-unpaid',403,'cancel foreign station',{actor:'outsider'});await run('main','cancel-unpaid',403,'cancel viewer lacks management',{actor:'viewer'});
  await run('main','resolve',409,'active operation not intervention');await run('main','resolve',400,'invalid reason before motor',{body:{reason:'x'},noEngine:true});
  await run('cancel','cancel-unpaid',201,'cancel empty operation');let state=await snapshot();await run('cancel','cancel-unpaid',201,'cancel replay');assert.deepEqual(await snapshot(),state);
  rollback(true);await run('main','cancel-unpaid',500,'cancel rollback');rollback(false);assert.equal((await db.terminalOperation.findUniqueOrThrow({where:{operationId:id('main-operation')}})).closedAt,null);await run('main','cancel-unpaid',201,'cancel retry definite rollback');
  state=await snapshot();rollback(true);await run('resolve','resolve',500,'resolve rollback');rollback(false);assert.deepEqual(await snapshot(),state);await run('resolve','resolve',201,'resolve intervention');state=await snapshot();await run('resolve','resolve',201,'resolve replay');assert.deepEqual(await snapshot(),state);
  await db.payment.create({data:{id:id('blocked-payment'),operationId:id('blocked-operation'),amount:'60.00',method:'YAPE',status:'PENDING',provider:'DEMO'}});await run('blocked','cancel-unpaid',409,'pending payment blocks cancellation');assert.equal((await db.payment.findUniqueOrThrow({where:{id:id('blocked-payment')}})).status,'PENDING');
  for(const key of ['ticket','rollback','lost','race'])await createDemoOrder(key);
  await run('ticket','recovery-ticket',403,'manager cannot issue exceptional ticket');
  await run('ticket','recovery-ticket',400,'ticket reason DTO rejected',{actor:'root',body:{reason:'short'},noEngine:true});
  await run('ticket','recovery-ticket',409,'live technical credential blocks recovery',{actor:'root'});
  for(const key of ['ticket','rollback','lost','race'])await db.terminalCredential.update({where:{id:id(key+'-credential')},data:{issuedAt:new Date('2025-01-01'),expiresAt:new Date('2026-01-01')}});
  const ticket=await run('ticket','recovery-ticket',201,'issue authorized pending payment ticket',{actor:'root'});assert(ticket.ticket);assert.equal(ticket.evidence.kind,'PENDING_PAYMENT');assert.equal(ticket.expiresInSeconds,300);
  await run('ticket','recovery-ticket',409,'existing pending ticket conflict',{actor:'root'});
  // Redis grants survive an SQL failure; the controller also retains its original denied audit.
  rollback(true);await run('rollback','recovery-ticket',500,'ticket SQL rollback leaves technical grant',{actor:'root'});rollback(false);assert(await store.command('GET',store.key('recovery-pending:'+id('rollback-terminal'))));await run('rollback','recovery-ticket',409,'ticket retry does not mint another grant',{actor:'root'});
  lose('kiosk.issueRecoveryTicket');await run('lost','recovery-ticket',503,'ticket response unknown after commit',{actor:'root'});await run('lost','recovery-ticket',409,'unknown ticket retry preserves pending conflict',{actor:'root'});
  const race=await Promise.all(['A','B'].map(()=>run('race','recovery-ticket',[201,409],'concurrent recovery ticket',{actor:'root',concurrent:true})));assert.equal(race.filter(x=>x.ticket).length,1);
  assert.equal(await db.operationalAuditEvent.count({where:{action:'TERMINAL_RECOVERY_REQUESTED',targetId:id('race-operation-row'),outcome:'SUCCESS'}}),1);
  assert((await db.operationalAuditEvent.count({where:{action:'TERMINAL_RECOVERY_REQUESTED',outcome:'ERROR'}}))>=5);
  assert.equal(await db.onlineOrder.count(),4);assert.equal(await db.transaction.count(),0);assert.equal(await db.receipt.count(),0);assert.equal(await db.inventoryReservation.count({where:{status:'PENDING_PAYMENT'}}),4);
  // Ticket generation never certifies payment or closes the four pending reservations.
  for(const key of ['ticket','rollback','lost','race'])assert.equal((await db.payment.findUniqueOrThrow({where:{operationId:id(key+'-operation')}})).status,'PENDING');
  assert.equal(await db.inventoryMovement.count(),initialInventory+4);assert.equal((await db.fuelInventory.findUniqueOrThrow({where:{stationId_fuelId:{stationId:id('station-A'),fuelId:id('fuel')}}})).liters.toFixed(3),'1000.000');
  flags.threeContracts=true;flags.permissionsAndStations=true;flags.rollbackCancelResolve=true;flags.replayCancelResolve=true;flags.ticketSqlRedisPartialOutcomePreserved=true;flags.singleConcurrentTicket=true;flags.noNewPaymentAttempt=true;flags.T01Untouched=true;
};
