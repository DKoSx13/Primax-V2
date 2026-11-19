const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
async function main(){
  const arm=process.env.ASTRA_ARM;assert(['baseline','candidate'].includes(arm));
  const root='/tmp/astra-lot1b-'+arm;
  fs.cpSync('/source',root,{recursive:true,filter:p=>!path.relative('/source',p).split(path.sep).some(s=>['node_modules','dist','build','.cache'].includes(s)||s.startsWith('.env'))});
  fs.symlinkSync('/app/node_modules',root+'/node_modules','dir');
  require('/app/node_modules/ts-node').register({project:root+'/tsconfig.json',transpileOnly:true});
  const {PrismaService}=require(root+'/src/prisma/prisma.service.ts');
  const {ConfigService}=require('/app/node_modules/@nestjs/config');
  const {KioskStore}=require(root+'/src/kiosk/redis-store.ts'),{KioskService}=require(root+'/src/kiosk/kiosk.service.ts');
  const {AuthorizationsService}=require(root+'/src/transactions/authorizations.service.ts');
  const {AuthorizationsRepository}=require(root+'/src/transactions/authorizations.repository.ts');
  const {WalletRepository}=require(root+'/src/wallet/wallet.repository.ts');
  const {PaymentsService}=require(root+'/src/payments/payments.service.ts');
  const {IncidentsService}=require(root+'/src/incidents/incidents.service.ts');
  const {saleFixture}=require(root+'/test/commerce-sale.fixture.ts'),request=require('/app/node_modules/supertest');
  const url=new URL(process.env.DATABASE_URL),redis=new URL(process.env.KIOSK_REDIS_URL);
  assert.equal(url.hostname,'postgres');assert.equal(url.port,'5432');assert.equal(redis.hostname,'redis');
  assert.match(process.env.ASTRA_SYNTHETIC_DB,/^synthetic_[a-f0-9]{12}$/);assert.equal(url.pathname,'/'+process.env.ASTRA_SYNTHETIC_DB);
  assert.equal(url.username,process.env.ASTRA_SYNTHETIC_USER);assert.equal(process.env.DATABASE_URL_UNPOOLED,process.env.DATABASE_URL);
  const secret=process.env.ASTRA_FIXTURE_SECRET;assert.match(secret,/^[a-f0-9]{96}$/);
  const seeded=new Set();
  function uuid(label){const h=crypto.createHash('sha256').update('SYNTHETIC-LOT1B-'+label).digest('hex'),id=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);seeded.add(id);return id;}
  const technical=label=>crypto.createHmac('sha256',secret).update(label).digest('hex');
  const station=uuid('station'),foreign=uuid('foreign'),csrf=Buffer.from(technical('csrf'),'hex').toString('base64url'),session=Buffer.from(technical('session'),'hex').toString('base64url');
  const keys=['post','zero','intervention','prezero','prepartial','preintervention','bad','rollback-create','rollback-progress','rollback-release','rollback-intervention',
    'lost-create','lost-progress','lost-release','lost-intervention','race-create','race-progress','race-release','race-intervention','ambiguous','rejected','credit','inactive','race-precreate'];
  const cases=Object.fromEntries(keys.map((key,i)=>{const pre=['prezero','prepartial','preintervention','rollback-intervention','lost-intervention','race-intervention','ambiguous','rejected','race-precreate'].includes(key);
    const id=name=>uuid(key+':'+name);return[key,{key,id,mode:pre?'PREPAGO':'POSTPAGO',plate:'B'+String(i).padStart(2,'0')+'-001',token:technical(key+':credential'),owner:id('owner')}];}));
  const db=new PrismaService();let store,f;
  try{
    const who=await db.$queryRaw`SELECT current_database() AS db,current_user AS role`;assert.equal(who[0].db,process.env.ASTRA_SYNTHETIC_DB);assert.equal(who[0].role,process.env.ASTRA_SYNTHETIC_USER);
    assert.equal((await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).length,0);
    const migration=spawnSync(process.execPath,['/app/node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{cwd:root,encoding:'utf8',env:process.env});
    fs.writeFileSync('/evidence/migrate.log',(migration.stdout||'')+(migration.stderr||''));assert.equal(migration.status,0);
    assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)[0].n,36);
    await db.station.createMany({data:[{id:station,code:'LAB',name:'Synthetic',address:'Synthetic'},{id:foreign,code:'FOREIGN',name:'Synthetic',address:'Synthetic'}]});
    for(const c of Object.values(cases))await db.$transaction(async tx=>{
      await tx.user.create({data:{id:c.id('user'),email:c.key+'@synthetic.invalid',name:'Synthetic '+c.key,passwordHash:'not-a-login-fixture',active:c.key!=='inactive'}});
      await tx.membership.create({data:{id:c.id('member'),userId:c.id('user'),number:'LAB-'+c.key.toUpperCase(),balance:c.key==='credit'?'20.00':'300.00',welcomeAvailable:false}});
      await tx.vehicle.create({data:{id:c.id('vehicle'),membershipId:c.id('member'),plate:c.plate,label:'Synthetic'}});
      await tx.fuel.create({data:{id:c.id('fuel'),code:c.key,name:'Synthetic',pricePerGallon:'20.00'}});
      await tx.fuelInventory.create({data:{stationId:station,fuelId:c.id('fuel'),liters:'1000.00'}});
      await tx.pump.create({data:{id:c.id('pump'),stationId:station,code:c.key,name:'Synthetic'}});
      await tx.terminal.create({data:{id:c.id('terminal'),stationId:station,code:'LAB-'+c.key}});
      await tx.terminalPumpAssignment.create({data:{id:c.id('assignment'),stationId:station,terminalId:c.id('terminal'),pumpId:c.id('pump'),startedAt:new Date('2026-01-01')}});
      await tx.terminalOperation.create({data:{id:c.id('operation-row'),operationId:c.id('operation'),stationId:station,terminalId:c.id('terminal'),pumpId:c.id('pump'),terminalPumpAssignmentId:c.id('assignment')}});
      await tx.terminalCredential.create({data:{id:c.id('credential'),terminalId:c.id('terminal'),tokenHash:crypto.createHash('sha256').update(c.token).digest('hex'),expiresAt:new Date('2099-01-01')}});
    });
    await db.membershipCodeAlias.create({data:{code:'OLD-POST',membershipId:cases.post.id('member')}});
    await db.fuelAuthorization.create({data:{id:uuid('foreign-auth'),operationId:uuid('foreign-op'),requestHash:'f'.repeat(64),plate:'ZZZ-999',stationId:foreign,
      fuelId:cases.post.id('fuel'),authorizedAmount:'100.00',reservedAmount:'0.00',balanceAfter:'0.00',membershipId:cases.post.id('member'),mode:'POSTPAGO',status:'RELEASED',outcome:'CANCELLED',unitPrice:'20.00'}});
    const config=new ConfigService({APP_MODE:'local',SOLES_PER_POINT:'10',CORS_ORIGINS:'http://localhost',KIOSK_GATEWAY_SECRET:secret,KIOSK_OPERATOR_USER:'synthetic',KIOSK_OPERATOR_PASSWORD_HASH:'not-a-login-fixture',
      KIOSK_STATION_ID:station,KIOSK_REDIS_URL:process.env.KIOSK_REDIS_URL,KIOSK_SESSION_NAMESPACE:process.env.ASTRA_NAMESPACE,KIOSK_API_KEY:technical('legacy')});
    store=new KioskStore(config);assert.equal(await store.command('DBSIZE'),0);
    const version=crypto.createHmac('sha256',secret).update(JSON.stringify(['synthetic','not-a-login-fixture',station,'1'])).digest('hex');
    const sessionKey=store.key('session:'+crypto.createHash('sha256').update(session).digest('hex')),sessionValue=JSON.stringify({authenticated:true,csrf,version,stationId:station,expiresAt:Date.now()+300000});
    await store.command('SET',sessionKey,sessionValue,'EX',300,'NX');
    for(const c of Object.values(cases))await store.command('SET',store.key('terminal-owner:'+c.id('terminal')),crypto.createHash('sha256').update(c.owner).digest('hex'),'EX',300,'NX');
    f=await saleFixture(db,config,new KioskService(config,store,db));
    const engine=f.module.get(AuthorizationsService),repo=f.module.get(AuthorizationsRepository),wallet=f.module.get(WalletRepository),payments=f.module.get(PaymentsService),incidents=f.module.get(IncidentsService);
    const calls={create:0,progress:0,release:0,intervention:0},native={};let fault='',lost='',paymentFault='',paymentCalls=0;
    for(const method of Object.keys(calls)){native[method]=engine[method].bind(engine);engine[method]=async(...args)=>{calls[method]++;const result=await native[method](...args);if(lost===method){lost='';const {ServiceUnavailableException}=require('/app/node_modules/@nestjs/common');throw new ServiceUnavailableException('Synthetic response lost after commit');}return result;};}
    const origCreate=repo.create.bind(repo),origSettle=repo.settle.bind(repo),origMovement=wallet.movement.bind(wallet),origIncident=incidents.recordConfirmedPaymentWithoutDispense.bind(incidents),origPayment=payments.authorize.bind(payments);
    // Equal fixture IDs preserve literal downstream request hashes across the two databases.
    // This override exists only on the test instance, not in the operational repository.
    repo.create=async(data,...args)=>{const r=await origCreate({...data,id:uuid('created-auth:'+data.operationId)},...args);if(fault==='create')throw Error('Synthetic failure after authorization insertion');return r;};
    repo.settle=async(...args)=>{const r=await origSettle(...args);if(fault==='progress')throw Error('Synthetic failure after physical debit');return r;};
    wallet.movement=async(...args)=>{const r=await origMovement(...args);if(fault==='release'&&args[0].kind==='RELEASE')throw Error('Synthetic failure after balance release');return r;};
    incidents.recordConfirmedPaymentWithoutDispense=async(...args)=>{const r=await origIncident(...args);if(fault==='intervention')throw Error('Synthetic failure after incident/audit');return r;};
    payments.authorize=(...args)=>{paymentCalls++;if(paymentFault==='ambiguous')throw Error('Synthetic payment outcome unknown');if(paymentFault==='rejected'){const {BadRequestException}=require('/app/node_modules/@nestjs/common');throw new BadRequestException('Synthetic definite rejection');}return origPayment(...args);};
    for(const c of Object.values(cases))c.body={operationId:c.id('operation'),plate:c.plate,stationId:station,fuelId:c.id('fuel'),amount:'100.00',unitPrice:'20.00',mode:c.mode,
      paymentMethod:c.mode==='PREPAGO'?'TARJETA':'SALDO_PRIME',membershipCode:'LAB-'+c.key.toUpperCase(),receiptType:'BOLETA'};
    cases.post.body.membershipCode='OLD-POST';
    const checks=[],responses=[];
    async function command(c,method,status,label,options={}){
      const body=options.body??(method==='create'?c.body:method==='progress'?{amount:'20.00',gallons:'1.000'}:{});
      const id=options.id||c.authId,path='/api/v1/authorizations'+(method==='create'?'':'/'+id+'/'+method);
      const auth=options.user?'Bearer '+await f.jwt.signAsync({sub:options.user==='other'?cases.zero.id('user'):c.id('user'),ver:0}):'';
      const req=request(f.app.getHttpServer()).post(path);if(auth)req.set('Authorization',auth);
      if(options.legacy)req.set('x-kiosk-key',technical('legacy'));
      if(!options.unsigned&&!options.legacy){const stamp=String(Date.now()-(options.oldTime?60000:0)),s=options.noSession?Buffer.from(technical('missing-session'),'hex').toString('base64url'):session,x=options.badCsrf?'bad':csrf,
        token=options.badCredential?'0'.repeat(64):c.token,owner=options.badOwner?uuid('wrong-owner'):c.owner;
        const sig=crypto.createHmac('sha256',secret).update(JSON.stringify(['POST',path,stamp,body,s,x,token,auth,owner])).digest('hex');
        req.set('x-kiosk-time',stamp).set('x-kiosk-session',s).set('x-csrf-token',x).set('x-terminal-session',token).set('x-terminal-owner',owner).set('x-kiosk-signature',options.badSignature?'0'.repeat(64):sig);}
      const before=calls[method],r=await req.send(body);assert.equal(r.status,status,label+': '+JSON.stringify(r.body));
      if(options.noEngine)assert.equal(calls[method],before,label+' must not invoke engine');else if(!options.concurrent)assert.equal(calls[method],before+1,label+' engine invoked once');
      if(status!==200&&status!==201)delete r.body.timestamp;
      checks.push({label,method,status});responses.push({label,body:r.body});return r.body;
    }
    async function tables(){const names=await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;const out={};for(const{tablename}of names){assert.match(tablename,/^[A-Za-z0-9_]+$/);out[tablename]=(await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t`)).map(x=>JSON.parse(x.row));}return out;}
    function stable(x){if(Array.isArray(x))return x.map(stable);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k])=>!['createdAt','updatedAt','issuedAt','openedAt','registeredAt','occurredAt','lastUsedAt','reconciledAt','expiresAt'].includes(k)).map(([k,v])=>[k,stable(v)]));return x;}
    const snapshot=async()=>stable(await tables());
    const create=async c=>{const r=await command(c,'create',201,c.key+' create');c.authId=r.authorization.id;assert.equal(r.replayed,false);return r;};
    const authRow=c=>db.fuelAuthorization.findUniqueOrThrow({where:{id:c.authId}});
    const reserve=c=>db.inventoryReservation.findUniqueOrThrow({where:{operationId:c.id('operation')}});
    const probe=cases.post;
    for(const[user,label]of [[undefined,'anonymous'],['self','member owner'],['other','other member']])await command(probe,'create',401,label+' cannot authorize',{unsigned:true,user,noEngine:true});
    for(const[opt,status]of [['badSignature',401],['oldTime',401],['noSession',401],['badCsrf',403],['badCredential',401],['badOwner',409]])await command(probe,'create',status,'create rejects '+opt,{[opt]:true,noEngine:true});
    await command(probe,'create',403,'create foreign station',{body:{...probe.body,stationId:foreign},noEngine:true});
    await command(probe,'create',400,'create invalid DTO',{body:{...probe.body,amount:'-1'},noEngine:true});
    await command(probe,'create',403,'legacy key cannot open new authorization',{legacy:true,noEngine:true});
    const fresh=await create(probe),afterCreate=await snapshot();
    assert.equal((await db.membership.findUniqueOrThrow({where:{id:probe.id('member')}})).balance.toFixed(2),'200.00');
    const again=await command(probe,'create',201,'post create replay');assert.equal(again.replayed,true);assert.equal(again.authorization.id,fresh.authorization.id);assert.deepEqual(await snapshot(),afterCreate);
    await command(probe,'create',409,'post create conflicting digest',{body:{...probe.body,amount:'99.00'}});assert.deepEqual(await snapshot(),afterCreate);
    for(const method of ['progress','release','intervention']){
      await command(probe,method,401,method+' member cannot write',{unsigned:true,user:'self',noEngine:true});
      await command(probe,method,401,method+' invalid signature',{badSignature:true,noEngine:true});
      await command(probe,method,403,method+' invalid CSRF',{badCsrf:true,noEngine:true});
      await command(probe,method,403,method+' foreign station resource',{id:uuid('foreign-auth'),noEngine:true});
      await command(probe,method,404,method+' missing resource',{id:uuid('absent-auth'),noEngine:true});
    }
    await command(probe,'progress',400,'progress invalid DTO',{body:{amount:'-1',gallons:'1.000'},noEngine:true});
    await command(probe,'progress',200,'post progress 40',{body:{amount:'40.00',gallons:'2.000'}});const progressState=await snapshot();
    await command(probe,'progress',200,'post equal progress',{body:{amount:'40.00',gallons:'2.000'}});assert.deepEqual(await snapshot(),progressState);
    await command(probe,'progress',200,'post stale progress',{body:{amount:'20.00',gallons:'1.000'}});assert.deepEqual(await snapshot(),progressState);
    await command(probe,'progress',400,'post over authorized',{body:{amount:'120.00',gallons:'6.000'}});
    await command(probe,'progress',400,'post invalid volume',{body:{amount:'40.00',gallons:'2.001'}});assert.deepEqual(await snapshot(),progressState);
    const partial=await command(probe,'release',200,'post release with consumption closes sale');assert(partial.transaction);assert.equal(partial.transaction.amount,'40.00');
    const partialState=await snapshot();const repeat=await command(probe,'release',200,'post release with consumption replay');assert.equal(repeat.replayed,true);assert.equal(repeat.transaction.id,partial.transaction.id);assert.deepEqual(await snapshot(),partialState);
    await command(probe,'progress',409,'settled cannot progress');await command(probe,'intervention',201,'settled intervention no-op');assert.deepEqual(await snapshot(),partialState);
    const zero=cases.zero;await create(zero);await command(zero,'release',200,'post release without consumption');const released=await snapshot();
    await command(zero,'release',200,'post release replay');await command(zero,'intervention',201,'released intervention no-op');assert.deepEqual(await snapshot(),released);
    assert.equal((await db.membership.findUniqueOrThrow({where:{id:zero.id('member')}})).balance.toFixed(2),'300.00');
    const inter=cases.intervention;await create(inter);await command(inter,'progress',200,'post intervention prior progress');await command(inter,'intervention',201,'post intervention');const interState=await snapshot();
    await command(inter,'intervention',201,'post intervention replay');assert.deepEqual(await snapshot(),interState);await command(inter,'progress',409,'intervened progress denied');await command(inter,'release',409,'intervened partial release denied');
    const pz=cases.prezero;await create(pz);await command(pz,'release',200,'prepay zero demo refund');const pzState=await snapshot();await command(pz,'release',200,'prepay zero refund replay');assert.deepEqual(await snapshot(),pzState);
    assert.equal((await db.payment.findUniqueOrThrow({where:{operationId:pz.id('operation')}})).refundedAmount.toFixed(2),'100.00');
    const pp=cases.prepartial;await create(pp);await command(pp,'progress',200,'prepay partial progress',{body:{amount:'40.00',gallons:'2.000'}});await command(pp,'release',200,'prepay partial closes sale');const ppState=await snapshot();await command(pp,'release',200,'prepay partial release replay');assert.deepEqual(await snapshot(),ppState);
    const pi=cases.preintervention;await create(pi);await command(pi,'intervention',201,'prepay confirmed no dispense intervention');const piState=await snapshot();await command(pi,'intervention',201,'prepay incident replay');assert.deepEqual(await snapshot(),piState);
    assert.equal(await db.operationalIncident.count({where:{operationId:pi.id('operation'),code:'INC_001'}}),1);await command(pi,'progress',409,'prepay intervention progress denied');await command(pi,'release',409,'prepay intervention release denied');
    const bad=cases.bad,alertsBefore=await db.businessAlert.count();await command(bad,'create',400,'foreign member code pre-alert',{body:{...bad.body,membershipCode:'LAB-ZERO'}});
    assert.equal(await db.businessAlert.count(),alertsBefore+1);assert.equal(await db.fuelAuthorization.count({where:{operationId:bad.id('operation')}}),0);
    await command(bad,'create',409,'stale confirmed price',{body:{...bad.body,unitPrice:'19.00'}});await command(bad,'create',400,'zero amount rejected',{body:{...bad.body,amount:'0'}});
    for(const method of ['create','progress','release','intervention']){
      const c=cases['rollback-'+method];if(method!=='create')await create(c);const before=await snapshot();fault=method;
      await command(c,method,500,'rollback '+method);fault='';assert.deepEqual(await snapshot(),before,'SQL rollback '+method);
      const r=await command(c,method,method==='create'||method==='intervention'?201:200,'retry after rollback '+method);if(method==='create')c.authId=r.authorization.id;
    }
    for(const method of ['create','progress','release','intervention']){
      const c=cases['lost-'+method];if(method!=='create')await create(c);lost=method;await command(c,method,503,'lost response '+method);const before=await snapshot();
      const r=await command(c,method,method==='create'||method==='intervention'?201:200,'recover committed '+method);if(method==='create'){c.authId=r.authorization.id;assert.equal(r.replayed,true);}assert.deepEqual(await snapshot(),before,'no duplicate effects after lost '+method);
    }
    for(const method of ['create','progress','release','intervention']){
      const c=cases['race-'+method];if(method!=='create')await create(c);const n=calls[method];
      const r=await Promise.all([command(c,method,method==='create'||method==='intervention'?201:200,'concurrent '+method+' A',{concurrent:true}),command(c,method,method==='create'||method==='intervention'?201:200,'concurrent '+method+' B',{concurrent:true})]);
      assert.equal(calls[method],n+2);if(method==='create'){assert.equal(r.filter(x=>!x.replayed).length,1);assert.equal(r[0].authorization.id,r[1].authorization.id);c.authId=r[0].authorization.id;}
      if(method==='progress'){assert.equal((await authRow(c)).dispensedAmount.toFixed(2),'20.00');assert.equal(await db.inventoryMovement.count({where:{authorizationId:c.authId,kind:'DISPENSE'}}),1);}
      if(method==='release')assert.equal(await db.walletMovement.count({where:{authorizationId:c.authId,kind:'RELEASE'}}),1);
      if(method==='intervention'){assert.equal((await db.terminalOperation.findUniqueOrThrow({where:{operationId:c.id('operation')}})).version,1);assert.equal(await db.operationalIncident.count({where:{operationId:c.id('operation'),code:'INC_001'}}),1);}
    }
    const pc=cases['race-precreate'],payBefore=paymentCalls;const pcResults=await Promise.all([command(pc,'create',201,'concurrent prepaid create A',{concurrent:true}),command(pc,'create',201,'concurrent prepaid create B',{concurrent:true})]);
    assert.equal(pcResults[0].authorization.id,pcResults[1].authorization.id);assert.equal(paymentCalls,payBefore+1);assert.equal(await db.payment.count({where:{operationId:pc.id('operation')}}),1);
    for(const kind of ['ambiguous','rejected']){const c=cases[kind],n=paymentCalls;paymentFault=kind;await command(c,'create',kind==='ambiguous'?500:400,'prepay '+kind+' outcome');paymentFault='';assert.equal(paymentCalls,n+1);assert.equal(await db.fuelAuthorization.count({where:{operationId:c.id('operation')}}),0);
      assert.equal((await db.payment.findUniqueOrThrow({where:{operationId:c.id('operation')}})).status,kind==='ambiguous'?'PENDING':'REJECTED');assert.equal((await reserve(c)).status,kind==='ambiguous'?'REVIEW':'CANCELLED');}
    const credit=cases.credit;await command(credit,'create',400,'insufficient balance without debt consent');const cr=await command(credit,'create',201,'existing allowDebt behavior',{body:{...credit.body,allowDebt:true}});credit.authId=cr.authorization.id;
    assert.equal(cr.authorization.reservedAmount,'20.00');assert.equal(cr.authorization.creditReserved,'80.00');await command(credit,'release',200,'credit reservation release preserves real balance');assert.equal((await db.membership.findUniqueOrThrow({where:{id:credit.id('member')}})).balance.toFixed(2),'20.00');
    await command(cases.inactive,'create',400,'inactive member denied');
    await command(probe,'release',200,'legacy key existing unscoped closed-resource compatibility',{legacy:true,id:uuid('foreign-auth')});
    assert.equal(await store.command('GET',sessionKey),sessionValue);
    const data=await tables(),map=new Map();const replace=x=>typeof x==='string'?x.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,id=>map.get(id)||id):x;
    const auditOccurrences=new Map();
    for(const row of data.OperationalAuditEvent||[])if(row.action==='PAYMENT_REVIEW_RECORDED'){
      const match=/^payment-review:([0-9a-f-]{36}):([0-9a-f-]{36})$/.exec(row.eventKey);assert(match);
      const index=(auditOccurrences.get(match[1])||0)+1;auditOccurrences.set(match[1],index);
      map.set(match[2],'<audit-observation:'+match[1]+':'+index+'>');
    }
    const identities={FuelAuthorization:r=>r.operationId,Transaction:r=>r.operationId,InventoryReservation:r=>r.operationId,Payment:r=>r.operationId||r.transactionId,Receipt:r=>r.transactionId,OnlineOrder:r=>r.operationId,
      WalletMovement:r=>[r.membershipId,r.authorizationId,r.kind,r.operationId].join(':'),RewardMovement:r=>[r.transactionId,r.kind].join(':'),InventoryMovement:r=>[r.stationId,r.fuelId,r.sequence,r.kind].join(':'),
      PaymentEvent:r=>r.eventKey,MembershipDebt:r=>r.transactionId,BusinessAlert:r=>r.eventKey,OperationalIncident:r=>r.eventKey,OperationalAuditEvent:r=>r.eventKey};
    for(const[table,key]of Object.entries(identities))for(const row of data[table]||[])if(row.id&&!seeded.has(row.id))map.set(row.id,'<'+table+':'+replace(key(row))+'>');
    function canonical(v){if(typeof v==='string')return replace(v);if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(stable(v)).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}
    delete data._prisma_migrations;const final=Object.fromEntries(Object.entries(data).map(([k,rows])=>[k,rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
    const sequences=await db.$queryRaw`SELECT sequencename,last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
    fs.writeFileSync('/evidence/comparison-data.json',JSON.stringify({checks:checks.sort((a,b)=>a.label.localeCompare(b.label)),responses:responses.map(canonical).sort((a,b)=>a.label.localeCompare(b.label)),snapshot:final,sequences},null,2)+'\n');
    fs.writeFileSync('/evidence/integration-results.json',JSON.stringify({arm,checks:checks.length,calls,paymentCalls,syntheticCases:keys.length,migrations:36,
      rollbackFourCommandsVerified:true,lostResponseFourCommandsVerified:true,concurrencyFourCommandsVerified:true,prepaidSinglePaymentInFlightVerified:true,
      noExtraPaymentAttemptOnUnknown:true,preAlertOutsideTransactionVerified:true,transactionRows:await db.transaction.count(),receiptRows:await db.receipt.count(),
      uuidMappingEntries:map.size,sequences,normalization:['Generated UUID correlation by table/natural key; seeded IDs literal','Lifecycle timestamps excluded','Concurrent response labels compared as a multiset','All financial amounts, states, relationships, hashes and sequence values retained'],
      legacyLimitation:'Signed kiosk station scope preserved; legacy key for existing by-ID commands remains unscoped outside academic mode'},null,2)+'\n');
    console.log(arm+': '+checks.length+' authorization HTTP checks passed');
  }finally{if(f)await f.app.close();if(store)await store.onModuleDestroy();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
