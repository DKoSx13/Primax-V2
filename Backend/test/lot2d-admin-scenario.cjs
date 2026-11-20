module.exports=async c=>{
  const {assert,db,id,call,config,snapshot,seedPassword,ocr,flags}=c;
  const b='/api/v1/admin';
  const accessBefore=await snapshot(), sequencesBefore=await c.sequences();
  assert.equal(await c.store.command('DBSIZE'),0);
  const disabled=await call('GET',b+'/demo-credentials',200,'demo disclosure disabled',{actor:'anonymous'});assert.deepEqual(disabled,{enabled:false});
  await call('POST',b+'/login',401,'admin invalid credentials',{actor:'anonymous',body:{username:'bad',password:'bad'}});
  const login=await call('POST',b+'/login',201,'original admin login',{actor:'anonymous',body:{username:'synthetic-admin',password:seedPassword}});assert.equal(typeof login.accessToken,'string');
  config.set('SHOW_DEMO_ADMIN_CREDENTIALS','true');config.set('DEMO_ADMIN_USER','demo-synthetic');config.set('DEMO_ADMIN_PASSWORD',seedPassword);
  const demo=await call('GET',b+'/demo-credentials',200,'demo credentials configured synthetic only',{actor:'anonymous'});assert.equal(demo.username,'demo-synthetic');assert.equal(demo.password,seedPassword);
  const demoLogin = await call('POST',b+'/login',201,'local demo login',{actor:'anonymous',body:{username:'demo-synthetic',password:seedPassword}});
  assert.equal(typeof demoLogin.accessToken,'string');
  for (const mode of ['production','staging','test']) {
    config.set('APP_MODE',mode);
    assert.deepEqual(await call('GET',b+'/demo-credentials',200,'demo disabled in '+mode,{actor:'anonymous'}),{enabled:false});
    await call('POST',b+'/login',401,'demo login denied in '+mode,{actor:'anonymous',body:{username:'demo-synthetic',password:seedPassword}});
    await call('POST',b+'/login',201,'configured admin login in '+mode,{actor:'anonymous',body:{username:'synthetic-admin',password:seedPassword}});
  }
  config.set('APP_MODE','local');
  config.set('SHOW_DEMO_ADMIN_CREDENTIALS','false');
  await call('POST',b+'/login',400,'admin invalid DTO',{actor:'anonymous',body:{username:42,password:'bad'}});
  for(const actor of ['expired','stale','viewer']) await call('GET',b+'/alerts',actor==='expired'?401:403,'admin session denied '+actor,{actor});
  for(const route of ['/alerts','/dashboard']){
    await call('GET',b+route,401,route+' anonymous',{actor:'anonymous'});await call('GET',b+route,403,route+' member denied',{actor:'member'});await call('GET',b+route,200,route+' original admin session',{actor:'admin-session',bearer:login.accessToken});
  }
  const expiredAdmin=await c.f.jwt.signAsync({sub:'admin',role:'admin',adminUser:'synthetic-admin'},{expiresIn:-1});
  await call('GET',b+'/alerts',401,'expired technical admin token',{actor:'admin-session',bearer:expiredAdmin});
  config.set('ADMIN_USER','synthetic-admin-rotated');
  await call('GET',b+'/alerts',403,'technical admin identity rotated',{actor:'admin-session',bearer:login.accessToken});
  config.set('ADMIN_USER','synthetic-admin');
  assert.deepEqual(await snapshot(),accessBefore); assert.deepEqual(await c.sequences(),sequencesBefore);
  assert.equal(await c.store.command('DBSIZE'),0); flags.adminAccessHasNoSqlOrRedisWrites=true;
  const check=(status,label,o={})=>call('POST',b+'/check-plate',status,label,{actor:'legacy',body:{plate:'ZZZ-999',membershipCode:'PRIME-111',operationId:id('check-operation')},engine:'alerts.checkPlate',...o});
  await check(401,'plate check member denied',{actor:'member',noEngine:true});await check(400,'check invalid DTO',{body:{plate:'bad',membershipCode:'x',operationId:'bad'},noEngine:true});
  await check(201,'mismatch alert original writer');await check(201,'mismatch repeat no duplicate alert');assert.equal(await db.businessAlert.count(),1);
  const alert=await db.businessAlert.findFirstOrThrow();await call('POST',b+'/alerts/'+alert.id+'/resolve',201,'resolve original alert',{actor:'root',engine:'alerts.resolve'});assert.equal((await db.businessAlert.findUniqueOrThrow({where:{id:alert.id}})).status,'RESOLVED');
  await call('POST',b+'/alerts/'+alert.id+'/resolve',201,'resolved alert replay',{actor:'root',engine:'alerts.resolve'});
  const recognize=(status,label,o={})=>call('POST','/api/v1/plate-recognition',status,label,{actor:'legacy',body:{image:'QUFBQUFBQUFBQUFB'},engine:'recognition.recognize',...o});
  for(const actor of ['anonymous','member','cookie'])await recognize(401,'recognition denies '+actor,{actor,noEngine:true});
  await recognize(400,'invalid image payload',{body:{image:'@'.repeat(16)}});await recognize(400,'unknown recognition kind',{body:{image:'QUFBQUFBQUFBQUFB',kind:'other'},noEngine:true});
  config.set('PLATE_RECOGNITION_ENABLED','false');await recognize(503,'OCR disabled');config.set('PLATE_RECOGNITION_ENABLED','true');
  let before=await snapshot();ocr({plate:'AAA-001',confidence:0.99});const found=await recognize(201,'recognized plate with original lookup');assert.equal(found.recognized,true);assert.equal(found.vehicle.id,id('member-vehicle'));assert.deepEqual(await snapshot(),before);
  ocr({plate:'ZZZ-999',confidence:0.99});const missing=await recognize(201,'recognized unknown vehicle');assert.equal(missing.vehicle,null);assert.equal(missing.recognized,true);
  ocr({plate:'AAA-001',confidence:0.1});const low=await recognize(201,'low confidence unchanged');assert.equal(low.recognized,false);
  ocr({plate:'INVALID',confidence:0.99});const invalid=await recognize(201,'malformed provider plate');assert.equal(invalid.plate,null);
  ocr({plate:'PRIME-111',confidence:0.99});const membership=await recognize(201,'membership alias recognition',{body:{image:'QUFBQUFBQUFBQUFB',kind:'membership'}});assert.equal(membership.recognized,true);assert.equal(membership.membership.number,'PRIM000111');
  ocr({},true);await recognize(503,'OCR transport unavailable');ocr({plate:'AAA-001',confidence:0.99});
  await Promise.all(['A','B'].map(k=>recognize(201,'concurrent recognition '+k,{concurrent:true})));assert.deepEqual(await snapshot(),before);
  flags.recognitionContract=true;flags.ocrTransportSimulated=true;flags.originalAdminRegressionsOnly=false;flags.demoLoginTechnicalExceptionsTested=true;flags.adminAccessBoundary=true;
};
