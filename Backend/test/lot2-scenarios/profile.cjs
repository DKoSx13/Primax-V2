module.exports=async c=>{
  const {assert,db,id,call,snapshot,rollback,lose,flags}=c;
  const profile=(status,label,o={})=>call('PATCH','/api/v1/memberships/me/profile',status,label,{actor:'member',engine:'profile.updateProfile',body:{dni:'12345678',businessName:' <b>Synthetic</b> '},...o});
  const link=(plate,status,label,o={})=>call('POST','/api/v1/vehicles',status,label,{actor:'member',engine:'vehicle.create',body:{plate,label:'Synthetic'},...o});
  for(const actor of ['anonymous','invalid','expired','stale','cookie','legacy'])await profile(401,'profile denies '+actor,{actor,noEngine:true});
  await profile(403,'profile inactive user',{actor:'inactive',noEngine:true});
  await profile(404,'profile absent membership',{actor:'staff'});
  await profile(400,'profile owner injection rejected',{body:{dni:'12345678',userId:id('target')},noEngine:true});
  await profile(400,'profile document conflict',{body:{dni:'12345678',passport:'ABCDE123'}});
  let before=await snapshot();rollback(true);await profile(500,'profile rollback');rollback(false);assert.deepEqual(await snapshot(),before);
  const first=await profile(200,'profile update and view');assert.equal(first.dni,'12345678');assert.equal((await db.membership.findUniqueOrThrow({where:{id:id('member-membership')}})).businessName,'Synthetic');
  assert.equal((await db.membership.findUniqueOrThrow({where:{id:id('target-membership')}})).dni,null);
  lose('profile.updateProfile');await profile(503,'profile response unknown after commit',{body:{ruc:'12345678901'}});const committed=await snapshot();await profile(200,'profile explicit retry',{body:{ruc:'12345678901'}});assert.deepEqual(await snapshot(),committed);
  for(const actor of ['anonymous','legacy','cookie'])await link('DDD-004',401,'link denies '+actor,{actor,noEngine:true});
  await link('invalid',400,'invalid plate DTO',{noEngine:true});
  await link('BBB-002',409,'cannot take another owners plate');
  const oldGuest=await db.vehicle.findUniqueOrThrow({where:{plate:'CCC-003'}});const adopted=await link('CCC-003',201,'link existing unowned vehicle');assert.equal(adopted.id,oldGuest.id);
  before=await snapshot();await link('CCC-003',201,'same owner replay preserves UUID');assert.deepEqual(await snapshot(),before);
  rollback(true);before=await snapshot();await link('DDD-004',500,'vehicle link rollback');rollback(false);assert.deepEqual(await snapshot(),before);
  lose('vehicle.create');await link('DDD-004',503,'link response unknown');const lost=await db.vehicle.findUniqueOrThrow({where:{plate:'DDD-004'}});const recovered=await link('DDD-004',201,'explicit link retry stable UUID');assert.equal(recovered.id,lost.id);
  const race=await Promise.all(['A','B'].map(k=>link('EEE-005',201,'concurrent link '+k,{concurrent:true})));assert.equal(race[0].id,race[1].id);assert.equal(await db.vehicle.count({where:{plate:'EEE-005'}}),1);
  for(const [route,label]of [['/api/v1/memberships/me','membership summary'],['/api/v1/memberships/me/transactions','transactions history'],['/api/v1/memberships/me/rewards','rewards history'],['/api/v1/memberships/me/redemptions','redemptions history'],['/api/v1/vehicles','vehicle list'],['/api/v1/vehicles/AAA-001','own plate lookup']]){
    await call('GET',route,200,label,{actor:'member'});await call('GET',route,401,label+' anonymous',{actor:'anonymous'});
  }
  await call('GET','/api/v1/vehicles/AAA-001',404,'other owner cannot lookup vehicle',{actor:'target'});
  const other=await call('GET','/api/v1/vehicles',200,'other owner vehicle list',{actor:'target'});assert.deepEqual(other.map(x=>x.plate),['BBB-002']);
  const ordered=await call('GET','/api/v1/vehicles?page=1&limit=2',200,'vehicle ordering and pagination',{actor:'member'});assert.deepEqual(ordered.map(x=>x.plate),['AAA-001','CCC-003']);
  await call('GET','/api/v1/memberships/me/transactions?userId='+id('target'),400,'history owner query rejected',{actor:'member'});
  assert.equal(await db.transaction.count(),0);assert.equal(await db.walletMovement.count(),0);flags.profileAndVehicle=true;flags.rollback=true;flags.replayAndConcurrentStableUuid=true;flags.ownerIsolation=true;flags.sixReadRegressions=true;
};
