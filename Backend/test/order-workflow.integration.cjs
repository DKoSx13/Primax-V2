const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
async function main(){
  const arm=process.env.ASTRA_ARM;assert(['baseline','candidate'].includes(arm));
  let externalHttpAttempts=0;global.fetch=async()=>{externalHttpAttempts++;throw Error('External HTTP forbidden');};
  // Same synthetic provider clock in both datasets; do not normalize paid/refunded evidence away.
  Date.now=()=>1795060800000;
  const root='/tmp/astra-lot1d-'+arm;fs.cpSync('/source',root,{recursive:true,filter:p=>!path.relative('/source',p).split(path.sep).some(s=>s.startsWith('.env')||['node_modules','dist','build','.cache'].includes(s))});
  fs.symlinkSync('/app/node_modules',root+'/node_modules','dir');require('/app/node_modules/ts-node').register({project:root+'/tsconfig.json',transpileOnly:true});
  const {PrismaService}=require(root+'/src/prisma/prisma.service.ts'),{ConfigService}=require('/app/node_modules/@nestjs/config');
  const {KioskStore}=require(root+'/src/kiosk/redis-store.ts'),{KioskService}=require(root+'/src/kiosk/kiosk.service.ts');
  const {OnlineOrdersService}=require(root+'/src/payments/online-orders.ts'),{PAYMENT_PROVIDER}=require(root+'/src/payments/payment-provider.ts');
  const {orderFixture}=require(root+'/test/order-workflow.fixture.ts'),request=require('/app/node_modules/supertest');
  const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'postgres');assert.equal(url.port,'5432');assert.match(process.env.ASTRA_SYNTHETIC_DB,/^synthetic_[a-f0-9]{12}$/);
  assert.equal(url.pathname,'/'+process.env.ASTRA_SYNTHETIC_DB);assert.equal(url.username,process.env.ASTRA_SYNTHETIC_USER);assert.equal(process.env.DATABASE_URL_UNPOOLED,process.env.DATABASE_URL);assert.equal(new URL(process.env.KIOSK_REDIS_URL).hostname,'redis');
  const secret=process.env.ASTRA_FIXTURE_SECRET;assert.match(secret,/^[a-f0-9]{96}$/);process.env.PAYMENT_WEBHOOK_SECRET=crypto.createHmac('sha256',secret).update('callback').digest('hex');
  const seeded=new Set(),uuid=label=>{const h=crypto.createHash('sha256').update('SYNTHETIC-LOT1D-'+label).digest('hex'),v=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);seeded.add(v);return v;};
  const technical=k=>crypto.createHmac('sha256',secret).update(k).digest('hex');
  const station=uuid('station'),foreign=uuid('foreign'),session=Buffer.from(technical('session'),'hex').toString('base64url'),csrf=Buffer.from(technical('csrf'),'hex').toString('base64url');
  const keys=['flow','cancel','reselect','refund','lost','race-create','race-status','rollback-create','rollback-capture','callback-race','debt',
    'ext-create-unknown','ext-no-reference','ext-mismatch','ext-get-unknown','ext-rejected','ext-expired','ext-not-paid','ext-refund','ext-rollback-event'];
  const cases=Object.fromEntries(keys.map((key,i)=>[key,{key,id:n=>uuid(key+':'+n),plate:'D'+String(i).padStart(2,'0')+'-001',owner:uuid(key+':owner'),token:technical(key+':credential'),external:key.startsWith('ext-')}]));
  const db=new PrismaService();let store,demo,commercial,createGate,getGate,createFault='',getFault='',refundFault=false,rollback=false;
  const providerCalls=[];
  const remote=new Map();
  const provider={
    assertConfigured(){},
    async create(id,cents){providerCalls.push({method:'create',id,cents});if(createFault==='before')throw Error('Synthetic provider outcome unknown');
      const r={id:'synthetic:'+id,order_number:id,amount:cents,currency_code:'PEN',state:'pending'};remote.set(r.id,r);
      if(createFault==='after')throw Error('Synthetic provider response lost');if(createFault==='mismatch')return {...r,amount:cents+1};return {...r};},
    async get(id){providerCalls.push({method:'get',id});if(getFault==='throw')throw Error('Synthetic provider temporarily unavailable');const r=remote.get(id);assert(r);
      return getFault==='mismatch'?{...r,currency_code:'USD'}:{...r};},
    async findByReference(id){providerCalls.push({method:'findByReference',id});const r=[...remote.values()].find(x=>x.order_number===id);return r?{...r}:null;},
    async cancel(id,key){providerCalls.push({method:'cancel',id,key});remote.get(id).state='cancelled';},
    async refund(id,key){providerCalls.push({method:'refund',id,key});Object.assign(remote.get(id),{state:'refunded',refunded_at:1795060800});if(refundFault)throw Error('Synthetic refund response unknown');}
  };
  try{
    const who=await db.$queryRaw`SELECT current_database() AS db,current_user AS role`;assert.equal(who[0].db,process.env.ASTRA_SYNTHETIC_DB);assert.equal(who[0].role,process.env.ASTRA_SYNTHETIC_USER);
    assert.equal((await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).length,0);
    const m=spawnSync(process.execPath,['/app/node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{cwd:root,encoding:'utf8',env:process.env});fs.writeFileSync('/evidence/migrate.log',(m.stdout||'')+(m.stderr||''));assert.equal(m.status,0);
    await db.station.createMany({data:[{id:station,code:'LAB',name:'Synthetic',address:'Synthetic'},{id:foreign,code:'FOREIGN',name:'Synthetic',address:'Synthetic'}]});
    for(const c of Object.values(cases))await db.$transaction(async tx=>{
      await tx.user.create({data:{id:c.id('user'),email:c.key+'@synthetic.invalid',name:'Synthetic',passwordHash:'not-a-login-fixture'}});
      await tx.membership.create({data:{id:c.id('member'),userId:c.id('user'),number:'LAB-'+c.key.toUpperCase(),balance:'20.00',welcomeAvailable:false}});
      await tx.vehicle.create({data:{id:c.id('vehicle'),plate:c.plate,label:'Synthetic',membershipId:c.id('member')}});
      await tx.fuel.create({data:{id:c.id('fuel'),code:c.key,name:'Synthetic',pricePerGallon:'20.00'}});
      await tx.fuelInventory.create({data:{stationId:station,fuelId:c.id('fuel'),liters:'1000.00'}});
      await tx.pump.create({data:{id:c.id('pump'),stationId:station,code:c.key,name:'Synthetic'}});
      await tx.terminal.create({data:{id:c.id('terminal'),stationId:station,code:'LAB-'+c.key}});
      await tx.terminalPumpAssignment.create({data:{id:c.id('assignment'),stationId:station,terminalId:c.id('terminal'),pumpId:c.id('pump'),startedAt:new Date('2026-01-01')}});
      await tx.terminalOperation.create({data:{id:c.id('operation-row'),operationId:c.id('operation'),stationId:station,terminalId:c.id('terminal'),pumpId:c.id('pump'),terminalPumpAssignmentId:c.id('assignment')}});
      await tx.terminalCredential.create({data:{id:c.id('credential'),terminalId:c.id('terminal'),tokenHash:crypto.createHash('sha256').update(c.token).digest('hex'),expiresAt:new Date('2099-01-01')}});
    });
    const debt=cases.debt;
    await db.transaction.create({data:{id:debt.id('sale'),operationId:debt.id('historical-sale-op'),requestHash:'a'.repeat(64),plate:debt.plate,vehicleId:debt.id('vehicle'),membershipId:debt.id('member'),stationId:station,fuelId:debt.id('fuel'),amount:'60.00',unitPrice:'20.00',gallons:'3.000',pointsRate:'0.1',pointsEarned:6,mode:'POSTPAGO',status:'PAYMENT_PENDING'}});
    await db.membershipDebt.create({data:{id:debt.id('debt'),membershipId:debt.id('member'),transactionId:debt.id('sale'),amountOriginal:'60.00',amountPending:'60.00'}});
    await db.payment.create({data:{id:debt.id('sale-payment'),transactionId:debt.id('sale'),amount:'60.00',method:'SALDO_PRIME',status:'PENDING',provider:'DEMO'}});
    const initialReceiptCount=await db.receipt.count();
    await db.onlineOrder.create({data:{id:uuid('foreign-order'),operationId:uuid('foreign-operation'),requestHash:'f'.repeat(64),method:'YAPE',amount:'60.00',status:'CANCELLED'}});
    const config=new ConfigService({APP_MODE:'local',SOLES_PER_POINT:'10',CORS_ORIGINS:'http://localhost',KIOSK_GATEWAY_SECRET:secret,KIOSK_OPERATOR_USER:'synthetic',KIOSK_OPERATOR_PASSWORD_HASH:'not-a-login-fixture',KIOSK_STATION_ID:station,KIOSK_REDIS_URL:process.env.KIOSK_REDIS_URL,KIOSK_SESSION_NAMESPACE:process.env.ASTRA_NAMESPACE,KIOSK_API_KEY:technical('legacy')});
    store=new KioskStore(config);assert.equal(await store.command('DBSIZE'),0);
    const version=crypto.createHmac('sha256',secret).update(JSON.stringify(['synthetic','not-a-login-fixture',station,'1'])).digest('hex');
    await store.command('SET',store.key('session:'+crypto.createHash('sha256').update(session).digest('hex')),JSON.stringify({authenticated:true,csrf,version,stationId:station,expiresAt:Date.now()+300000}),'EX',300,'NX');
    await store.command('SET',store.key('operation:'+uuid('foreign-operation')),foreign,'EX',300,'NX');
    for(const c of Object.values(cases))await store.command('SET',store.key('terminal-owner:'+c.id('terminal')),crypto.createHash('sha256').update(c.owner).digest('hex'),'EX',300,'NX');
    demo=await orderFixture(db,config,new KioskService(config,store,db));commercial=await orderFixture(db,config,new KioskService(config,store,db),provider);
    const demoProvider=demo.module.get(PAYMENT_PROVIDER);
    for(const method of ['create','get','confirm','cancel','refund','findByReference']){
      const original=demoProvider[method].bind(demoProvider);demoProvider[method]=async(...args)=>{
        providerCalls.push({demo:true,method,args});if(method==='create'&&createGate){createGate.arrived();await createGate.wait;}
        if(method==='get'&&getGate){getGate.count++;if(getGate.count===2)getGate.release();await getGate.wait;}
        return original(...args);
      };
    }
    const engineCalls={};let lost='';
    for(const [mode,f]of [['demo',demo],['commercial',commercial]]){
      const engine=f.module.get(OnlineOrdersService);for(const method of ['create','status','confirmDemo','cancel','reselect','refund','webhook']){
        const original=engine[method].bind(engine);engine[method]=async(...args)=>{const k=mode+':'+method;engineCalls[k]=(engineCalls[k]||0)+1;let value;try{value=await original(...args);}catch(error){console.error('Synthetic diagnostic '+k,error);throw error;}
          if(lost===k){lost='';const {ServiceUnavailableException}=require('/app/node_modules/@nestjs/common');throw new ServiceUnavailableException('Synthetic response loss after original workflow');}return value;};
      }
    }
    const origAtomic=db.atomic.bind(db);db.atomic=work=>origAtomic(async tx=>{const v=await work(tx);if(rollback)throw Error('Synthetic failure before original atomic commit');return v;});
    for(const c of Object.values(cases)){c.authorization={operationId:c.id('operation'),stationId:station,fuelId:c.id('fuel'),plate:c.plate,amount:'60.00',unitPrice:'20.00',mode:'PREPAGO',paymentMethod:'YAPE',receiptType:'BOLETA'};
      c.body={operationId:c.id('operation'),method:'YAPE',authorization:c.authorization,...(c.external?{customer:{first_name:'Synthetic',last_name:'Fixture',email:'provider@synthetic.invalid',phone_number:'000000000'}}:{})};}
    debt.body={operationId:debt.id('operation'),method:'YAPE',transactionId:debt.id('sale')};
    const checks=[],responses=[];
    async function call(c,method,status,label,o={}){
      const f=c.external?commercial:demo,verb=method==='status'?'GET':'POST';
      const route=method==='webhook'?'/api/v1/payments/webhook':'/api/v1/online-orders'+(method==='create'?'':'/'+(o.id||c.orderId)+(method==='status'?'':'/'+({confirmDemo:'demo-confirm'}[method]||method)));
      const body=o.body??(method==='create'?c.body:method==='confirmDemo'?{amount:'60.00',currency:'PEN'}:{}),actor=o.actor??(['webhook','notify'].includes(method)?'callback':c===debt?'member':'signed');
      const req=request(f.app.getHttpServer())[verb.toLowerCase()](route);let bearer='';
      if(['member','other','expired'].includes(actor)){bearer='Bearer '+await f.jwt.signAsync({sub:actor==='other'?cases.flow.id('user'):c.id('user'),ver:0},actor==='expired'?{expiresIn:-1}:{});req.set('Authorization',bearer);}
      if(actor==='invalid')req.set('Authorization','Bearer invalid-synthetic');if(actor==='legacy')req.set('x-kiosk-key',technical('legacy'));
      if(actor==='signed'){
        const stamp=String(Date.now()),xsrf=o.badCsrf?'wrong':csrf,signature=crypto.createHmac('sha256',secret).update(JSON.stringify([verb,route,stamp,verb==='GET'?null:body,session,xsrf,c.token,'',c.owner])).digest('hex');
        req.set('x-kiosk-time',stamp).set('x-kiosk-session',session).set('x-csrf-token',xsrf).set('x-terminal-session',c.token).set('x-terminal-owner',c.owner).set('x-kiosk-signature',o.badSignature?'0'.repeat(64):signature);
      }
      if(actor==='callback'&&!o.noSecret)req.set('x-webhook-secret',o.badSecret?'wrong-synthetic':process.env.PAYMENT_WEBHOOK_SECRET);
      const before=Object.values(engineCalls).reduce((a,b)=>a+b,0),r=await req.send(verb==='GET'?undefined:body);assert.equal(r.status,status,label+': '+JSON.stringify(r.body));
      if(o.noEngine)assert.equal(Object.values(engineCalls).reduce((a,b)=>a+b,0),before,label+' must not dispatch');
      if(status!==200&&status!==201)delete r.body.timestamp;checks.push({label,status});responses.push({label,body:r.body});return r.body;
    }
    const create=async c=>{const r=await call(c,'create',201,c.key+' create');c.orderId=r.id;return r;};
    const order=c=>db.onlineOrder.findUniqueOrThrow({where:{operationId:c.id('operation')}}),payment=c=>db.payment.findUniqueOrThrow({where:{operationId:c.id('operation')}}),reservation=c=>db.inventoryReservation.findUniqueOrThrow({where:{operationId:c.id('operation')}});
    async function tables(){const names=await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;const out={};for(const{tablename}of names){assert.match(tablename,/^[A-Za-z0-9_]+$/);out[tablename]=(await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t`)).map(x=>JSON.parse(x.row));}return out;}
    const ignored=['createdAt','updatedAt','issuedAt','openedAt','registeredAt','occurredAt','lastUsedAt','reconciledAt','expiresAt','settledAt'];
    function stable(x){if(Array.isArray(x))return x.map(stable);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k])=>!ignored.includes(k)).map(([k,v])=>[k,stable(v)]));return x;}
    const snapshot=async()=>stable(await tables()),event=(c,id,type='PAID')=>({eventId:'synthetic-'+id,orderId:c.orderId,type});
    const flow=cases.flow;
    for(const[actor,status]of [['anonymous',401],['member',401],['invalid',401],['expired',401],['legacy',403]])await call(flow,'create',status,'create denies '+actor,{actor,noEngine:actor!=='member'});
    await call(flow,'create',401,'create signature invalid',{badSignature:true,noEngine:true});await call(flow,'create',403,'create csrf invalid',{badCsrf:true,noEngine:true});
    await call(flow,'create',403,'create foreign station',{body:{...flow.body,authorization:{...flow.authorization,stationId:foreign}},noEngine:true});
    await call(flow,'create',400,'create invalid DTO',{body:{...flow.body,method:'INVALID'},noEngine:true});
    await create(flow);const pending=await snapshot();await call(flow,'create',201,'create replay');assert.deepEqual(await snapshot(),pending);
    await call(flow,'create',409,'create digest conflict',{body:{...flow.body,authorization:{...flow.authorization,amount:'61.00'}}});assert.deepEqual(await snapshot(),pending);
    await call(flow,'status',403,'signed foreign order binding',{id:uuid('foreign-order'),noEngine:true});
    await call(flow,'status',200,'legacy existing foreign closed order policy',{actor:'legacy',id:uuid('foreign-order')});
    await call(flow,'confirmDemo',409,'demo wrong amount',{body:{amount:'59.00',currency:'PEN'}});
    await call(flow,'webhook',401,'webhook missing secret',{body:event(flow,'missing'),noSecret:true,noEngine:true});
    await call(flow,'webhook',401,'webhook wrong secret',{body:event(flow,'wrong'),badSecret:true,noEngine:true});
    await call(flow,'notify',401,'notify wrong secret',{badSecret:true,noEngine:true});
    await call(flow,'webhook',400,'webhook invalid DTO',{body:{...event(flow,'invalid'),type:'UNTRUSTED'},noEngine:true});
    await call(flow,'webhook',400,'early paid callback cannot confirm pending provider',{body:event(flow,'early')});assert.equal((await payment(flow)).status,'PENDING');
    await call(flow,'notify',201,'notify pending is not confirmation');
    await call(flow,'confirmDemo',201,'demo confirmation');assert.equal((await payment(flow)).status,'CAPTURED');
    const captured=await snapshot();await call(flow,'status',200,'repeated reconcile captured');assert.deepEqual(await snapshot(),captured);
    await call(flow,'webhook',201,'paid callback',{body:event(flow,'paid')});const callbackState=await snapshot();
    const replay=await call(flow,'webhook',201,'paid callback replay',{body:event(flow,'paid')});assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(),callbackState);
    await call(flow,'webhook',409,'event reuse wrong payload',{body:event(flow,'paid','FAILED')});await call(flow,'webhook',400,'out of order failed after paid',{body:event(flow,'late-failed','FAILED')});assert.deepEqual(await snapshot(),callbackState);
    await call(flow,'cancel',409,'captured cannot cancel');
    const cancel=cases.cancel;await create(cancel);await call(cancel,'cancel',201,'demo cancel');const cancelled=await snapshot();await call(cancel,'cancel',201,'demo cancel replay');assert.deepEqual(await snapshot(),cancelled);assert.equal((await reservation(cancel)).status,'CANCELLED');
    await call(cancel,'webhook',201,'cancel callback',{body:event(cancel,'cancel','CANCELLED')});
    const reselect=cases.reselect;await create(reselect);const beforeCard=await snapshot();await call(reselect,'reselect',500,'existing card reselect constraint failure rolls back',{body:{operationId:reselect.id('operation'),method:'TARJETA',authorization:{...reselect.authorization,paymentMethod:'TARJETA'}}});assert.deepEqual(await snapshot(),beforeCard);
    await call(reselect,'reselect',201,'demo reselect PLIN',{body:{operationId:reselect.id('operation'),method:'PLIN',authorization:{...reselect.authorization,paymentMethod:'PLIN'}}});
    assert.equal((await payment(reselect)).method,'PLIN');await call(reselect,'cancel',201,'cancel reselected');
    const refund=cases.refund;await create(refund);await call(refund,'confirmDemo',201,'refund prerequisite capture');await call(refund,'refund',201,'demo refund');const refunded=await snapshot();await call(refund,'refund',201,'demo refund replay');assert.deepEqual(await snapshot(),refunded);assert.equal((await reservation(refund)).status,'CANCELLED');
    await call(refund,'webhook',201,'refund callback',{body:event(refund,'refund','REFUNDED')});
    const lostCase=cases.lost;lost='demo:create';await call(lostCase,'create',503,'create response lost');lostCase.orderId=(await order(lostCase)).id;const lostState=await snapshot();await call(lostCase,'create',201,'recover create replay');assert.deepEqual(await snapshot(),lostState);
    lost='demo:status';await call(lostCase,'status',503,'status response lost');await call(lostCase,'status',200,'status retry');
    const rb=cases['rollback-create'],beforeRb=await snapshot();rollback=true;await call(rb,'create',500,'rollback intent before provider');rollback=false;assert.deepEqual(await snapshot(),beforeRb);await create(rb);
    const rc=cases['rollback-capture'];await create(rc);await demoProvider.confirm((await order(rc)).providerId,6000);const beforeCapture=await snapshot();rollback=true;await call(rc,'status',500,'rollback financial capture');rollback=false;assert.deepEqual(await snapshot(),beforeCapture);await call(rc,'status',200,'capture retry after rollback');
    const race=cases['race-create'];let arrived,release;createGate={arrived:()=>arrived(),wait:new Promise(r=>release=r)};const arrivedPromise=new Promise(r=>arrived=r);
    const first=call(race,'create',201,'concurrent create A');await arrivedPromise;const second=await call(race,'create',201,'concurrent create B');assert.equal(second.status,'CREATING');release();const firstResult=await first;createGate=null;race.orderId=firstResult.id;assert.equal(firstResult.id,second.id);assert.equal(await db.onlineOrder.count({where:{operationId:race.id('operation')}}),1);
    const rs=cases['race-status'];await create(rs);await demoProvider.confirm((await order(rs)).providerId,6000);let releaseStatus;getGate={count:0,wait:new Promise(r=>releaseStatus=r),release:()=>releaseStatus()};
    await Promise.all([call(rs,'status',200,'concurrent capture A'),call(rs,'status',200,'concurrent capture B')]);getGate=null;assert.equal(await db.paymentEvent.count({where:{eventKey:'capture:'+rs.orderId}}),1);
    const cw=cases['callback-race'];await create(cw);await demoProvider.confirm((await order(cw)).providerId,6000);let unlock;getGate={count:0,wait:new Promise(r=>unlock=r),release:()=>unlock()};
    await Promise.all([call(cw,'webhook',201,'concurrent callback A',{body:event(cw,'race')}),call(cw,'webhook',201,'concurrent callback B',{body:event(cw,'race')})]);getGate=null;assert.equal(await db.paymentEvent.count({where:{eventKey:'webhook:synthetic-race'}}),1);
    await create(debt);await call(debt,'status',404,'other member cannot read debt order',{actor:'other'});await call(debt,'status',403,'kiosk cannot access member debt order',{actor:'signed',noEngine:true});
    await call(debt,'confirmDemo',201,'member pays own debt');assert.equal((await db.membershipDebt.findUniqueOrThrow({where:{id:debt.id('debt')}})).status,'SETTLED');
    const debtPaid=await snapshot();await call(debt,'confirmDemo',201,'member debt confirmation replay');assert.deepEqual(await snapshot(),debtPaid);
    await call(debt,'refund',201,'member debt refund reopens debt');assert.equal((await db.membershipDebt.findUniqueOrThrow({where:{id:debt.id('debt')}})).amountPending.toFixed(2),'60.00');assert.equal((await db.membership.findUniqueOrThrow({where:{id:debt.id('member')}})).balance.toFixed(2),'20.00');
    const unknown=cases['ext-create-unknown'];createFault='after';await call(unknown,'create',500,'provider create response unknown');createFault='';unknown.orderId=(await order(unknown)).id;assert.equal((await order(unknown)).status,'CREATING');assert.equal((await reservation(unknown)).status,'REVIEW');
    const providerCreateCount=providerCalls.filter(x=>x.method==='create'&&!x.demo).length;await call(unknown,'create',201,'unknown create retry returns intent');assert.equal(providerCalls.filter(x=>x.method==='create'&&!x.demo).length,providerCreateCount);await call(unknown,'status',200,'recover by provider reference');
    const nr=cases['ext-no-reference'];createFault='before';await call(nr,'create',500,'provider unobserved create');createFault='';nr.orderId=(await order(nr)).id;await call(nr,'status',200,'no reference remains unknown');assert.equal((await order(nr)).status,'CREATING');
    const finder=provider.findByReference;provider.findByReference=undefined;await call(nr,'status',503,'missing reference adapter remains unavailable');provider.findByReference=finder;
    const mm=cases['ext-mismatch'];createFault='mismatch';await call(mm,'create',409,'mismatched create response');createFault='';mm.orderId=(await order(mm)).id;
    const ug=cases['ext-get-unknown'];await create(ug);getFault='throw';await call(ug,'status',500,'provider read unknown');getFault='mismatch';await call(ug,'status',409,'provider read wrong currency');getFault='';remote.get((await order(ug)).providerId).state='unrecognized';await call(ug,'status',200,'provider state unrecognized retains review');assert.equal((await payment(ug)).status,'PENDING');
    for(const [key,state,type]of [['ext-rejected','rejected','FAILED'],['ext-expired','expired','CANCELLED']]){const c=cases[key];await create(c);remote.get((await order(c)).providerId).state=state;await call(c,'status',200,key+' authoritative rejection');assert.equal((await reservation(c)).status,'CANCELLED');await call(c,'webhook',201,key+' terminal callback',{body:event(c,key,type)});}
    const np=cases['ext-not-paid'];await create(np);await call(np,'webhook',400,'payload paid without provider proof',{body:event(np,'untrusted')});assert.equal((await payment(np)).status,'PENDING');
    const er=cases['ext-refund'];await create(er);Object.assign(remote.get((await order(er)).providerId),{state:'paid',paid_at:1795060800});await call(er,'notify',201,'external simulated paid notify');refundFault=true;await call(er,'refund',500,'external refund response unknown');refundFault=false;assert.equal((await order(er)).status,'REFUNDING');await call(er,'status',200,'GET does not certify refunding');
    await call(er,'webhook',201,'refund callback confirms authoritative result',{body:event(er,'external-refund','REFUNDED')});assert.equal((await payment(er)).status,'REFUNDED');assert.equal((await reservation(er)).status,'CANCELLED');const erState=await snapshot();await call(er,'webhook',201,'refund callback replay',{body:event(er,'external-refund','REFUNDED')});assert.deepEqual(await snapshot(),erState);
    const re=cases['ext-rollback-event'];await create(re);Object.assign(remote.get((await order(re)).providerId),{state:'paid',paid_at:1795060800});await call(re,'status',200,'event rollback prerequisite capture');const eventBefore=await snapshot();rollback=true;await call(re,'webhook',500,'rollback callback event',{body:event(re,'rollback')});rollback=false;assert.deepEqual(await snapshot(),eventBefore);await call(re,'webhook',201,'callback retry after rollback',{body:event(re,'rollback')});
    lost='commercial:webhook';await call(re,'webhook',503,'callback response lost',{body:event(re,'lost-callback')});const eventAfter=await snapshot();await call(re,'webhook',201,'callback replay after response loss',{body:event(re,'lost-callback')});assert.deepEqual(await snapshot(),eventAfter);
    assert.equal(externalHttpAttempts,0);assert.equal(await db.receipt.count(),initialReceiptCount,'order workflows preserve the seeded historical receipt');
    const data=await tables(),map=new Map(),replace=x=>typeof x==='string'?x.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,id=>map.get(id)||id):x;
    const auditCounts=new Map();for(const r of data.OperationalAuditEvent||[])if(r.action==='PAYMENT_REVIEW_RECORDED'){const m=/^payment-review:([0-9a-f-]{36}):([0-9a-f-]{36})$/.exec(r.eventKey);assert(m);const n=(auditCounts.get(m[1])||0)+1;auditCounts.set(m[1],n);map.set(m[2],'<audit-observation:'+m[1]+':'+n+'>');}
    const ids={OnlineOrder:r=>r.operationId,Payment:r=>r.operationId||r.transactionId,Receipt:r=>r.transactionId,InventoryReservation:r=>r.operationId,WalletMovement:r=>[r.membershipId,r.kind,r.operationId].join(':'),PaymentEvent:r=>r.eventKey,OperationalIncident:r=>r.eventKey,OperationalAuditEvent:r=>r.eventKey,InventoryMovement:r=>[r.stationId,r.fuelId,r.sequence,r.kind].join(':')};
    for(const[table,key]of Object.entries(ids))for(const r of data[table]||[])if(r.id&&!seeded.has(r.id))map.set(r.id,'<'+table+':'+replace(key(r))+'>');
    function canonical(v){if(typeof v==='string')return replace(v);if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(stable(v)).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}
    delete data._prisma_migrations;const financialSnapshot=Object.fromEntries(Object.entries(data).map(([k,rows])=>[k,rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
    const sequences=await db.$queryRaw`SELECT sequencename,last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
    fs.writeFileSync('/evidence/comparison-data.json',JSON.stringify({checks:checks.sort((a,b)=>a.label.localeCompare(b.label)),responses:responses.map(canonical).sort((a,b)=>a.label.localeCompare(b.label)),snapshot:financialSnapshot,sequences,providerCalls:providerCalls.map(canonical)},null,2)+'\n');
    fs.writeFileSync('/evidence/integration-results.json',JSON.stringify({arm,checks:checks.length,syntheticCases:keys.length,engineCalls,externalHttpAttempts,migrations:(await db.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)[0].n,providerCalls:providerCalls.length,
      realDemoProvider:true,commercialProviderSimulated:true,rollbackIntentCaptureAndCallbackVerified:true,unknownCreateAndRefundPreserved:true,lostResponseCreateStatusCallbackVerified:true,concurrencyCreateCaptureCallbackVerified:true,memberDebtSettlementAndRefundVerified:true,
      financialRows:await db.transaction.count(),receiptRows:await db.receipt.count(),sequences,uuidMappingEntries:map.size,limits:['Commercial provider contract simulation only; no Culqi certification','Original internal retries/unknown semantics retained','Not all crash/interleaving/provider paths proven']},null,2)+'\n');
    console.log(arm+': '+checks.length+' order/reconciliation/callback HTTP checks passed');
  }finally{if(demo)await demo.app.close();if(commercial)await commercial.app.close();if(store)await store.onModuleDestroy();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
