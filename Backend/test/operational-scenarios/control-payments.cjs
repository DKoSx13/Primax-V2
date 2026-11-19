module.exports=async c=>{
  const {assert,db,id,call,snapshot,rollback,lose,seedOperation,createDemoOrder,flags}=c,b='/api/v1/control/payments';
  await seedOperation('main');await seedOperation('other');await createDemoOrder('ticket');await createDemoOrder('lost');
  const read=(key,status,label,o={})=>call('GET',b+'/'+id(key+'-operation'),status,label,{actor:'manager',engine:'payments.detail',...o});
  const act=(key,action,status,label,o={})=>call('POST',b+'/'+id(key+'-operation')+'/actions',status,label,{actor:'manager',engine:'payments.act',body:{action,observation:'Synthetic observation'},...o});
  const initial=await snapshot(),seq=await c.sequences();
  for(const [actor,status]of [['anonymous',401],['legacy',401],['member',403],['terminal',403],['expired',401],['invalid',401]]){
    await read('main',status,'payment read denies '+actor,{actor,noEngine:true});await act('main','ESCALATE',status,'payment action denies '+actor,{actor,noEngine:true});
  }
  await read('main',403,'foreign control station',{actor:'outsider'});await read('absent',404,'absent payment operation');
  const empty=await read('main',200,'empty operation financial view');assert.equal(empty.payment,null);assert.deepEqual(empty.allowedActions,['ESCALATE','CANCEL']);
  const view=await read('ticket',200,'viewer read without actions',{actor:'viewer'});assert.deepEqual(view.allowedActions,[]);
  const pending=await read('ticket',200,'pending demo payment detail');assert.equal(pending.payment.amount,'60');assert(pending.allowedActions.includes('RESELECT'));assert(pending.allowedActions.includes('RETRY'));assert(pending.allowedActions.includes('CANCEL'));
  assert.deepEqual(await snapshot(),initial,'financial view has no writes');
  await act('ticket','ESCALATE',403,'viewer cannot manage',{actor:'viewer'});await act('ticket','ESCALATE',403,'outsider cannot manage',{actor:'outsider'});
  await act('ticket','INVALID',400,'invalid action DTO',{noEngine:true});
  await act('main','RETRY',409,'retry without order blocked');await act('main','RESELECT',409,'reselect without order blocked');
  const paymentBefore=await db.payment.findUniqueOrThrow({where:{operationId:id('ticket-operation')}});
  await act('ticket','RESELECT',201,'reselect only advises client');assert.deepEqual(await db.payment.findUniqueOrThrow({where:{operationId:id('ticket-operation')}}),paymentBefore);
  await act('ticket','RETRY',201,'retry consults original pending provider');assert.equal((await db.payment.findUniqueOrThrow({where:{operationId:id('ticket-operation')}})).status,'PENDING');
  let state=await snapshot();rollback(true);await act('main','ESCALATE',500,'escalation audit and incident rollback');rollback(false);assert.deepEqual(await snapshot(),state);await act('main','ESCALATE',201,'escalation retry');
  await act('main','ESCALATE',201,'repeated escalation keeps append-only observation');assert.equal(await db.operationalIncident.count({where:{operationId:id('main-operation')}}),1);
  lose('payments.act');await act('main','ESCALATE',503,'escalation response unknown');await act('main','ESCALATE',201,'explicit escalation retry retains original audit semantics');assert.equal(await db.operationalIncident.count({where:{operationId:id('main-operation')}}),1);
  const incident=await db.operationalIncident.findFirstOrThrow({where:{operationId:id('main-operation')}});assert.equal(incident.status,'OPEN');
  await Promise.all(['A','B'].map(key=>act('ticket','RETRY',201,'concurrent payment retry '+key,{concurrent:true})));assert.equal(await db.onlineOrder.count({where:{operationId:id('ticket-operation')}}),1);assert.equal(await db.payment.count({where:{operationId:id('ticket-operation')}}),1);
  await act('ticket','CANCEL',201,'cancel pending demo and close empty attention');assert.equal((await db.onlineOrder.findUniqueOrThrow({where:{operationId:id('ticket-operation')}})).status,'CANCELLED');assert.equal((await db.payment.findUniqueOrThrow({where:{operationId:id('ticket-operation')}})).status,'CANCELLED');assert((await db.terminalOperation.findUniqueOrThrow({where:{operationId:id('ticket-operation')}})).closedAt);
  state=await snapshot();await act('ticket','CANCEL',201,'cancel replay retains legitimate control audit');assert.equal(await db.onlineOrder.count(),2);assert.equal(await db.payment.count(),2);
  lose('payments.act');await act('lost','CANCEL',503,'cancel response unknown after original workflow');await act('lost','CANCEL',201,'explicit cancel retry without second provider cancel');assert.equal((await db.payment.findUniqueOrThrow({where:{operationId:id('lost-operation')}})).status,'CANCELLED');
  await db.fuelAuthorization.create({data:{id:id('main-auth'),operationId:id('main-operation'),requestHash:'a'.repeat(64),plate:'AAA-001',stationId:id('station-A'),fuelId:id('fuel'),authorizedAmount:'60.00',reservedAmount:0,balanceAfter:0,mode:'POSTPAGO',membershipId:id('member-membership'),status:'RESERVED',unitPrice:'20.00'}});
  await act('main','CANCEL',409,'active authorization forbids unsafe cancel');
  assert.deepEqual(await c.sequences(),seq);assert.equal(await db.transaction.count(),0);assert.equal(await db.receipt.count(),0);assert.equal(await db.walletMovement.count(),0);
  flags.twoContracts=true;flags.permissionStationIsolation=true;flags.readOnlyDetail=true;flags.auditRollback=true;flags.appendOnlyRepeatedActionPreserved=true;flags.pendingRetryDoesNotCapture=true;flags.cancelUnknownDoesNotDuplicateProvider=true;flags.activeAuthorizationBlocksCancel=true;
};
