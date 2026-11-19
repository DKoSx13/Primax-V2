const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
async function main() {
  let externalHttpAttempts=0;
  global.fetch=async()=>{externalHttpAttempts++;throw Error('External HTTP prohibited in synthetic payment test');};
  const arm = process.env.ASTRA_ARM; assert(['baseline', 'candidate'].includes(arm));
  const root = '/tmp/astra-lot1c-payments-' + arm;
  fs.cpSync('/source', root, { recursive: true, filter: p => !path.relative('/source', p).split(path.sep)
    .some(s => ['node_modules', 'dist', 'build', '.cache'].includes(s) || s.startsWith('.env')) });
  fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
  if (arm === 'baseline') for (const file of ['transactions.controller.ts', 'transactions.module.ts']) fs.copyFileSync('/reference/' + file, root + '/src/transactions/' + file);
  require('/app/node_modules/ts-node').register({ project: root + '/tsconfig.json', transpileOnly: true });
  const { PrismaService } = require(root + '/src/prisma/prisma.service.ts');
  const { ConfigService } = require('/app/node_modules/@nestjs/config');
  const { KioskStore } = require(root + '/src/kiosk/redis-store.ts');
  const { KioskService } = require(root + '/src/kiosk/kiosk.service.ts');
  const { AuthorizationsService } = require(root + '/src/transactions/authorizations.service.ts');
  const { saleFixture } = require(root + '/test/commerce-sale.fixture.ts');
  const request = require('/app/node_modules/supertest');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'postgres'); assert.equal(url.port, '5432');
  assert.match(process.env.ASTRA_SYNTHETIC_DB, /^synthetic_[a-f0-9]{12}$/);
  assert.equal(url.pathname, '/' + process.env.ASTRA_SYNTHETIC_DB); assert.equal(url.username, process.env.ASTRA_SYNTHETIC_USER);
  assert.equal(process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL);
  const redisUrl = new URL(process.env.KIOSK_REDIS_URL); assert.equal(redisUrl.hostname, 'redis');
  const fixtureSecret = process.env.ASTRA_FIXTURE_SECRET; assert.match(fixtureSecret, /^[a-f0-9]{96}$/);
  const seededIds = new Set();
  const uuid = label => { const h = crypto.createHash('sha256').update('SYNTHETIC-LOT1C-' + label).digest('hex'); const value=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32); seededIds.add(value); return value; };
  const technical = label => crypto.createHmac('sha256', fixtureSecret).update(label).digest('hex');
  const stationId = uuid('station'), otherStationId = uuid('foreign');
  const csrf = Buffer.from(technical('csrf'),'hex').toString('base64url'), session = Buffer.from(technical('session'),'hex').toString('base64url');
  const cases = [
    { key: 'post', mode: 'POSTPAGO', amount: '100.00', profile: true },
    { key: 'discount', mode: 'POSTPAGO', amount: '100.00', welcome: true },
    { key: 'round', mode: 'POSTPAGO', amount: '99.99', price: '21.30' },
    { key: 'pre', mode: 'PREPAGO', amount: '100.00' },
    { key: 'partial-demo', mode: 'PREPAGO', amount: '60.00' },
    { key: 'partial-external', mode: 'PREPAGO', amount: '60.00', provider: 'CULQI' },
    { key: 'invalid-payment', mode: 'PREPAGO', amount: '100.00', paymentStatus: 'PENDING' },
    { key: 'rollback', mode: 'POSTPAGO', amount: '100.00', profile: true },
    { key: 'lost', mode: 'POSTPAGO', amount: '60.00' },
    { key: 'race', mode: 'POSTPAGO', amount: '60.00' },
    { key: 'plate-alert', mode: 'POSTPAGO', amount: '100.00' },
  ];
  for(const key of ['refund','refund-rollback','refund-lost','refund-race']) cases.push({key,mode:'PREPAGO',amount:'100.00'});
  for(const key of ['partial-rejected','partial-rollback','partial-lost','partial-race','partial-conflict']) cases.push({key,mode:'PREPAGO',amount:'60.00',provider:'CULQI'});
  const db = new PrismaService(); let store, f;
  try {
    const who = await db.$queryRaw`SELECT current_database() AS db,current_user AS role`;
    assert.equal(who[0].db, process.env.ASTRA_SYNTHETIC_DB); assert.equal(who[0].role, process.env.ASTRA_SYNTHETIC_USER);
    assert.equal((await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).length, 0);
    const migrate = spawnSync(process.execPath, ['/app/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { cwd: root, encoding: 'utf8', env: process.env });
    fs.writeFileSync('/evidence/migrate.log', (migrate.stdout || '') + (migrate.stderr || '')); assert.equal(migrate.status, 0);
    await db.station.createMany({ data: [{ id: stationId, code: 'LAB', name: 'Synthetic', address: 'Synthetic' }, { id: otherStationId, code: 'OTHER', name: 'Synthetic', address: 'Synthetic' }] });
    for (const [i, c] of cases.entries()) {
      const id = name => uuid(c.key + ':' + name); c.id = id;
      c.plate = 'L' + String(i).padStart(2,'0') + '-001'; c.token = technical(c.key + ':credential'); c.owner = id('owner');
      const price = c.price || '20.00';
      await db.$transaction(async tx => {
        await tx.user.create({ data: { id: id('user'), email: c.key+'@synthetic.invalid', name: 'Synthetic '+c.key, passwordHash: 'not-a-login-fixture' } });
        await tx.membership.create({ data: { id: id('member'), userId: id('user'), number: 'LAB-'+c.key.toUpperCase(), balance: '100.00', welcomeAvailable: !!c.welcome } });
        await tx.vehicle.create({ data: { id: id('vehicle'), plate: c.plate, label: 'Synthetic', membershipId: id('member') } });
        await tx.fuel.create({ data: { id: id('fuel'), code: 'F'+i, name: 'Synthetic', pricePerGallon: price } });
        await tx.fuelInventory.create({ data: { stationId, fuelId: id('fuel'), liters: '1000.00' } });
        await tx.pump.create({ data: { id: id('pump'), stationId, code: 'P'+i, name: 'Synthetic' } });
        await tx.terminal.create({ data: { id: id('terminal'), stationId, code: 'LAB'+i } });
        await tx.terminalPumpAssignment.create({ data: { id: id('assignment'), stationId, terminalId: id('terminal'), pumpId: id('pump'), startedAt: new Date('2026-01-01T00:00:00Z') } });
        await tx.terminalOperation.create({ data: { id: id('operation-row'), operationId: id('operation'), stationId, terminalId: id('terminal'), pumpId: id('pump'), terminalPumpAssignmentId: id('assignment') } });
        await tx.terminalCredential.create({ data: { id: id('credential'), terminalId: id('terminal'), tokenHash: crypto.createHash('sha256').update(c.token).digest('hex'), expiresAt: new Date('2099-01-01') } });
        if (c.mode === 'PREPAGO') await tx.payment.create({ data: { id: id('payment'), operationId: id('operation'), amount: '100.00', method: 'TARJETA', status: c.paymentStatus || 'CAPTURED', provider: c.provider || 'DEMO' } });
        await tx.fuelAuthorization.create({ data: { id: id('auth'), operationId: id('operation'), requestHash: 'a'.repeat(64), membershipId: c.mode === 'POSTPAGO' ? id('member') : null,
          vehicleId: c.mode === 'POSTPAGO' ? id('vehicle') : null, plate: c.plate, stationId, fuelId: id('fuel'), unitPrice: price,
          authorizedAmount: '100.00', reservedAmount: c.mode === 'POSTPAGO' ? '100.00' : '0.00', balanceAfter: '100.00', mode: c.mode,
          paymentId: c.mode === 'PREPAGO' ? id('payment') : null, terminalOperationId: id('operation-row'), terminalId: id('terminal'), pumpId: id('pump'), terminalPumpAssignmentId: id('assignment') } });
        if (c.mode === 'POSTPAGO') await tx.walletMovement.create({ data: { id: id('reserve-movement'), membershipId: id('member'), authorizationId: id('auth'), kind: 'RESERVE', amount: '-100.00', balanceAfter: '100.00' } });
        await tx.$queryRaw`SELECT inventory_create_reservation(${id('operation')}::uuid,${stationId}::uuid,${id('fuel')}::uuid,'TERMINAL'::"InventoryReservationSource",5::numeric,${'a'.repeat(64)}::char(64),${id('auth')}::uuid,${id('operation-row')}::uuid,NULL)`;
        await tx.fuelAuthorization.update({ where: { id: id('auth') }, data: { inventoryManaged: true } });
      });
    }
    await db.user.create({data:{id:uuid('admin'),email:'admin@synthetic.invalid',name:'Synthetic Admin',passwordHash:'not-a-login-fixture'}});
    await db.userPermissionGrant.create({data:{id:uuid('admin-grant'),userId:uuid('admin'),permission:'SYSTEM_ADMIN',reason:'Synthetic fixture only',grantedAt:new Date('2026-01-01T00:00:00Z')}});
    const config = new ConfigService({ APP_MODE: 'local', SOLES_PER_POINT: '10', CORS_ORIGINS: 'http://localhost',
      KIOSK_GATEWAY_SECRET: fixtureSecret, KIOSK_OPERATOR_USER: 'synthetic', KIOSK_OPERATOR_PASSWORD_HASH: 'not-a-login-fixture', KIOSK_STATION_ID: stationId,
      KIOSK_REDIS_URL: process.env.KIOSK_REDIS_URL, KIOSK_SESSION_NAMESPACE: process.env.ASTRA_NAMESPACE, KIOSK_API_KEY: technical('legacy') });
    store = new KioskStore(config); assert.equal(await store.command('DBSIZE'), 0);
    const version = crypto.createHmac('sha256', fixtureSecret).update(JSON.stringify(['synthetic','not-a-login-fixture',stationId,'1'])).digest('hex');
    const sessionKey = store.key('session:'+crypto.createHash('sha256').update(session).digest('hex'));
    const sessionValue = JSON.stringify({ authenticated: true, csrf, version, stationId, expiresAt: Date.now()+300000 });
    await store.command('SET', sessionKey, sessionValue, 'EX', 300, 'NX');
    for (const c of cases) await store.command('SET',store.key('terminal-owner:'+c.id('terminal')),crypto.createHash('sha256').update(c.owner).digest('hex'),'EX',300,'NX');
    f = await saleFixture(db, config, new KioskService(config, store, db));
    const { Prisma } = require('/app/node_modules/@prisma/client');
    for (const c of cases) {
      const gallons = new Prisma.Decimal(c.amount).div(c.price || '20').toDecimalPlaces(3).toFixed(3);
      await f.module.get(AuthorizationsService).progress(c.id('auth'), { amount: c.amount, gallons });
      c.body = { operationId: c.id('operation'), authorizationId: c.id('auth'), plate: c.plate, stationId, fuelId: c.id('fuel'), amount: c.amount,
        gallons, unitPrice: c.price || '20.00', mode: c.mode, paymentMethod: c.mode === 'POSTPAGO' ? 'SALDO_PRIME' : 'TARJETA', receiptType: 'BOLETA',
        ...(c.mode === 'POSTPAGO' ? { membershipCode: 'LAB-'+c.key.toUpperCase() } : {}), ...(c.profile ? { saveReceiptProfile: true, receiptDni: c.key==='post'?'00000000':'00000001' } : {}) };
    }
    const nativeCreate = f.engine.create.bind(f.engine), nativeRepoCreate = f.repository.create.bind(f.repository); let engineCalls = 0, failInside = false, failAfter = false;
    f.engine.create = async dto => { engineCalls++; const value = await nativeCreate(dto); if (failAfter) { failAfter = false; const { ServiceUnavailableException } = require('/app/node_modules/@nestjs/common'); throw new ServiceUnavailableException('Synthetic response lost after commit'); } return value; };
    f.repository.create = async (...args) => { const row = await nativeRepoCreate(...args); if (failInside) throw Error('Synthetic failure after transaction insertion'); return row; };
    const checks = [], responses = [];
    async function post(c, status, label, options = {}) {
      const body = options.body || c.body, auth = options.user ? 'Bearer '+await f.jwt.signAsync({ sub: options.user==='other'?cases[1].id('user'):c.id('user'), ver: 0 }) : '';
      const call = request(f.app.getHttpServer()).post('/api/v1/transactions'); if (auth) call.set('Authorization', auth);
      if (!options.unsigned) {
        const stamp = String(Date.now()), token = options.badTerminal ? 'f'.repeat(64) : c.token, owner = options.badOwner ? uuid('wrong-owner') : c.owner;
        const xsrf = options.badCsrf ? 'wrong' : csrf;
        const sig = crypto.createHmac('sha256',fixtureSecret).update(JSON.stringify(['POST','/api/v1/transactions',stamp,body,session,xsrf,token,auth,owner])).digest('hex');
        call.set('x-kiosk-time',stamp).set('x-kiosk-session',session).set('x-csrf-token',xsrf).set('x-terminal-session',token).set('x-terminal-owner',owner).set('x-kiosk-signature',options.badSignature?'0'.repeat(64):sig);
      }
      const n = engineCalls, result = await call.send(body); assert.equal(result.status,status,label+': '+JSON.stringify(result.body));
      if (options.noEngine) assert.equal(engineCalls,n,label+' engine must not run'); else if (!options.concurrent) assert.equal(engineCalls,n+1,label+' engine invoked once');
      if (status!==201) delete result.body.timestamp;
      checks.push({label,status}); responses.push({label,body:result.body}); return result.body;
    }
    async function rawTables() {
      const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      const result = {};
      for (const {tablename} of tables) { assert.match(tablename,/^[A-Za-z0-9_]+$/); const data=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t`); result[tablename]=data.map(x=>JSON.parse(x.row)); }
      return result;
    }
    function withoutTimes(value) { if(Array.isArray(value))return value.map(withoutTimes);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['createdAt','updatedAt','issuedAt','openedAt','registeredAt','occurredAt','lastUsedAt','reconciledAt','expiresAt'].includes(k)).map(([k,v])=>[k,withoutTimes(v)]));return value; }
    const pre = cases[0];
    await post(pre,401,'no authentication',{unsigned:true,noEngine:true});
    await post(pre,401,'member owner is not a kiosk writer',{unsigned:true,user:'user',noEngine:true});
    await post(pre,401,'other member cannot write',{unsigned:true,user:'other',noEngine:true});
    await post(pre,401,'invalid signature',{badSignature:true,noEngine:true});
    await post(pre,403,'invalid CSRF',{badCsrf:true,noEngine:true});
    await post(pre,401,'invalid technical credential',{badTerminal:true,noEngine:true});
    await post(pre,409,'foreign terminal owner',{badOwner:true,noEngine:true});
    await post(pre,403,'foreign station',{body:{...pre.body,stationId:otherStationId},noEngine:true});
    await post(pre,400,'invalid DTO',{body:{...pre.body,amount:'-1'},noEngine:true});
    await post(pre,400,'uncontracted tax field rejected',{body:{...pre.body,igv:'18.00'},noEngine:true});
    const beforeBad = withoutTimes(await rawTables());
    await post(pre,400,'mismatched fuel',{body:{...pre.body,fuelId:cases[1].id('fuel')}});
    assert.deepEqual(withoutTimes(await rawTables()),beforeBad);
    await post(pre,400,'foreign membership code',{body:{...pre.body,membershipCode:'LAB-DISCOUNT'}});
    assert.deepEqual(withoutTimes(await rawTables()),beforeBad);
    for(const c of cases.filter(c=>!['rollback','race','lost','plate-alert','invalid-payment'].includes(c.key))) {
      const r=await post(c,201,c.key+' first commit'); assert.equal(r.replayed,false);
      const sale=await db.transaction.findUniqueOrThrow({where:{operationId:c.id('operation')},include:{payment:true,receipt:true,rewardMovement:true}});
      assert(sale.receipt); assert.equal(sale.amount.toFixed(2),c.welcome?'90.00':c.amount);
      assert.equal(sale.discountAmount.toFixed(2),c.welcome?'10.00':'0.00');
      assert.equal(sale.pointsEarned,c.mode==='POSTPAGO'?new Prisma.Decimal(sale.amount).div(10).floor().toNumber():0);
      const reservation=await db.inventoryReservation.findUniqueOrThrow({where:{operationId:c.id('operation')}});assert.equal(reservation.status,'CLOSED');assert(reservation.remainingLiters.isZero());
      const state=withoutTimes(await rawTables()); const sequence=await db.$queryRaw`SELECT last_value FROM receipt_boleta_seq`;
      const again=await post(c,201,c.key+' replay');assert.equal(again.replayed,true);assert.equal(again.transaction.id,r.transaction.id);
      assert.deepEqual(withoutTimes(await rawTables()),state); assert.deepEqual(await db.$queryRaw`SELECT last_value FROM receipt_boleta_seq`,sequence);
      await post(c,409,c.key+' conflicting digest',{body:{...c.body,receiptDni:'00000002'}});
      assert.deepEqual(withoutTimes(await rawTables()),state);
      if(c.profile)assert.equal((await db.membership.findUniqueOrThrow({where:{id:c.id('member')}})).dni,c.body.receiptDni);
      if(c.provider==='CULQI'){assert.equal(sale.status,'PAYMENT_PENDING');assert.equal(sale.payment.refundedAmount.toFixed(2),'0.00');assert(await db.paymentEvent.findUnique({where:{eventKey:'partial-refund-pending:'+c.id('auth')}}));}
    }
    const invalid=cases.find(c=>c.key==='invalid-payment'), invalidBefore=withoutTimes(await rawTables());
    await post(invalid,400,'prepaid payment not captured'); assert.deepEqual(withoutTimes(await rawTables()),invalidBefore);
    const rb=cases.find(c=>c.key==='rollback'), rollbackBefore=withoutTimes(await rawTables()); failInside=true;
    await post(rb,500,'failure after profile payment sale and receipt insertion'); failInside=false;
    assert.deepEqual(withoutTimes(await rawTables()),rollbackBefore,'full SQL data rollback including receipt row/profile/ledger');
    await post(rb,201,'retry after definite rollback');
    const lost=cases.find(c=>c.key==='lost');failAfter=true;await post(lost,503,'response lost after commit');
    const lostState=withoutTimes(await rawTables()); const recovered=await post(lost,201,'same operation recovers committed outcome'); assert.equal(recovered.replayed,true);assert.deepEqual(withoutTimes(await rawTables()),lostState);
    const race=cases.find(c=>c.key==='race'), calls=engineCalls;
    const concurrent=await Promise.all([post(race,201,'concurrent A',{concurrent:true}),post(race,201,'concurrent B',{concurrent:true})]);
    assert.equal(engineCalls,calls+2);assert.equal(new Set(concurrent.map(x=>x.transaction.id)).size,1);assert.equal(concurrent.filter(x=>!x.replayed).length,1);
    assert.equal(await db.transaction.count({where:{operationId:race.id('operation')}}),1);
    const mismatch=cases.find(c=>c.key==='plate-alert'), alertsBefore=await db.businessAlert.count();
    await post(mismatch,404,'pre-hook alert remains outside failing financial transaction',{body:{...mismatch.body,plate:'ZZZ-999'}});
    assert.equal(await db.businessAlert.count(),alertsBefore+1);assert.equal(await db.transaction.count({where:{operationId:mismatch.id('operation')}}),0);
    assert.equal(await store.command('GET',sessionKey),sessionValue);
    const { PaymentLifecycleService }=require(root+'/src/payments/payment-lifecycle.ts');
    const { PartialRefundService }=require(root+'/src/payments/partial-refund.ts');
    const lifecycle=f.module.get(PaymentLifecycleService),partial=f.module.get(PartialRefundService);
    const paymentCalls={refund:0,inspect:0,report:0};let lostPayment='';
    for(const [kind,service,method]of [['refund',lifecycle,'refund'],['inspect',partial,'get'],['report',partial,'report']]){
      const original=service[method].bind(service);service[method]=async(...args)=>{paymentCalls[kind]++;const value=await original(...args);
        if(lostPayment===kind){lostPayment='';const {ServiceUnavailableException}=require('/app/node_modules/@nestjs/common');throw new ServiceUnavailableException('Synthetic response loss after original method');}return value;};
    }
    const origAtomic=db.atomic.bind(db);let rollbackPayment=false;
    db.atomic=work=>origAtomic(async tx=>{const value=await work(tx);if(rollbackPayment)throw Error('Synthetic failure after payment writes before commit');return value;});
    const snapshot=async()=>withoutTimes(await rawTables());
    const paymentId=c=>c.id('payment'),byKey=key=>cases.find(c=>c.key===key);
    const observed=(key,outcome='CONFIRMED',patch={})=>({eventId:uuid('observation:'+key),outcome,amount:'40.00',reference:'synthetic-evidence-'+key,...patch});
    await db.payment.create({data:{id:uuid('foreign-payment'),amount:'20.00',method:'TARJETA',status:'CAPTURED',provider:'DEMO'}});
    await db.fuelAuthorization.create({data:{id:uuid('foreign-auth'),operationId:uuid('foreign-operation'),requestHash:'f'.repeat(64),plate:'ZZZ-999',stationId:otherStationId,
      fuelId:pre.id('fuel'),authorizedAmount:'20.00',reservedAmount:0,balanceAfter:0,mode:'PREPAGO',paymentId:uuid('foreign-payment'),unitPrice:'20.00'}});
    async function pay(c,kind,status,label,options={}){
      const verb=kind==='inspect'?'GET':'POST',body=options.body??(kind==='report'?observed(c.key):{}),id=options.id??paymentId(c);
      const route='/api/v1/payments/'+id+(kind==='refund'?'/refund':'/partial-refund');
      const req=request(f.app.getHttpServer())[verb.toLowerCase()](route);
      const actor=options.actor??(kind==='refund'?'signed':'admin');
      if(['admin','member','expired'].includes(actor))req.set('Authorization','Bearer '+await f.jwt.signAsync({sub:actor==='member'?c.id('user'):uuid('admin'),ver:0},actor==='expired'?{expiresIn:-1}:{}));
      if(actor==='invalid')req.set('Authorization','Bearer invalid-synthetic-token');
      if(actor==='legacy')req.set('x-kiosk-key',technical('legacy'));
      if(actor==='cookie')req.set('Cookie','primax_control='+await f.jwt.signAsync({sub:uuid('admin'),ver:0}));
      if(actor==='signed'){
        const stamp=String(Date.now()),xsrf=options.badCsrf?'bad':csrf;
        const sig=crypto.createHmac('sha256',fixtureSecret).update(JSON.stringify([verb,route,stamp,verb==='GET'?null:body,session,xsrf,c.token,'',c.owner])).digest('hex');
        req.set('x-kiosk-time',stamp).set('x-kiosk-session',session).set('x-csrf-token',xsrf).set('x-terminal-session',c.token).set('x-terminal-owner',c.owner).set('x-kiosk-signature',options.badSignature?'0'.repeat(64):sig);
      }
      const before=paymentCalls[kind],r=await req.send(verb==='GET'?undefined:body);assert.equal(r.status,status,label+': '+JSON.stringify(r.body));
      if(options.noEngine)assert.equal(paymentCalls[kind],before,label);else if(!options.concurrent)assert.equal(paymentCalls[kind],before+1,label+' delegates once');
      if(status!==200&&status!==201)delete r.body.timestamp;checks.push({label,status});responses.push({label,body:r.body});return r.body;
    }
    const ext=byKey('partial-external'),refund=byKey('refund');
    for(const kind of ['refund','inspect','report']){
      const c=kind==='refund'?refund:ext;
      for(const[actor,status]of [['anonymous',401],['member',kind==='refund'?401:403],['invalid',401],['expired',401],['cookie',401]])
        await pay(c,kind,status,kind+' denies '+actor,{actor,noEngine:true});
      await pay(c,kind,401,kind+' denies bad kiosk signature',{badSignature:true,actor:'signed',noEngine:true});
      await pay(c,kind,403,kind+' denies bad kiosk csrf',{badCsrf:true,actor:'signed',noEngine:true});
      await pay(c,kind,403,kind+' denies foreign station signed',{id:uuid('foreign-payment'),actor:'signed',noEngine:true});
      await pay(c,kind,400,kind+' invalid UUID',{id:'invalid-id',actor:kind==='refund'?'legacy':'admin',noEngine:true});
    }
    const readState=await snapshot();const pending=await pay(ext,'inspect',200,'inspect pending');assert.equal(pending.outcome,'PENDING');
    await pay(ext,'inspect',403,'signed kiosk cannot inspect administrative partial refund',{actor:'signed',noEngine:true});assert.deepEqual(await snapshot(),readState,'GET causes no business writes');
    await pay(ext,'inspect',401,'legacy does not grant admin access',{actor:'legacy',noEngine:true});
    await pay(ext,'inspect',404,'admin missing payment',{id:uuid('absent-payment')});
    await pay(ext,'report',400,'invalid observation DTO',{body:observed('invalid','CONFIRMED',{amount:'-1'}),noEngine:true});
    await pay(ext,'report',409,'wrong observed amount',{body:observed('wrong','CONFIRMED',{amount:'39.99'})});assert.deepEqual(await snapshot(),readState);
    await pay(ext,'report',403,'signed kiosk cannot report administrative partial refund',{actor:'signed',body:observed('signed-ambiguous','AMBIGUOUS'),noEngine:true});
    const ambiguous=await pay(ext,'report',201,'record unknown refund outcome',{body:observed('ambiguous','AMBIGUOUS')});assert.equal(ambiguous.outcome,'AMBIGUOUS');assert.equal(ambiguous.transactionStatus,'PAYMENT_PENDING');assert.equal(ambiguous.refundedAmount,'0.00');
    const unknownState=await snapshot();await pay(ext,'report',201,'ambiguous event replay',{body:observed('ambiguous','AMBIGUOUS')});assert.deepEqual(await snapshot(),unknownState);
    await pay(ext,'report',409,'event reused with different reference',{body:observed('ambiguous','AMBIGUOUS',{reference:'different-synthetic-evidence'})});assert.deepEqual(await snapshot(),unknownState);
    const confirmed=await pay(ext,'report',201,'confirm observed partial refund',{body:observed('confirmed','CONFIRMED',{reference:' synthetic-confirmed '})});assert.equal(confirmed.outcome,'CONFIRMED');assert.equal(confirmed.refundedAmount,'40.00');assert.equal(confirmed.transactionStatus,'PAID');
    const confirmedState=await snapshot();await pay(ext,'report',201,'confirmed replay trims reference',{body:observed('confirmed','CONFIRMED',{reference:'synthetic-confirmed'})});assert.deepEqual(await snapshot(),confirmedState);
    await pay(ext,'report',409,'opposite definitive outcome rejected',{body:observed('opposite','REJECTED')});assert.deepEqual(await snapshot(),confirmedState);
    const ignored=await pay(ext,'report',201,'late ambiguous observation retained and ignored',{body:observed('late','AMBIGUOUS')});assert.equal(ignored.ignored,true);assert.equal(ignored.outcome,'CONFIRMED');
    const rejected=byKey('partial-rejected'),rr=await pay(rejected,'report',201,'reject observed partial refund',{body:observed('rejected','REJECTED')});assert.equal(rr.outcome,'REJECTED');assert.equal(rr.transactionStatus,'PAYMENT_PENDING');assert.equal(rr.refundedAmount,'0.00');
    await pay(rejected,'report',409,'confirmed cannot overwrite rejected',{body:observed('rejected-opposite')});
    await pay(byKey('pre'),'inspect',409,'demo payment cannot use external partial workflow');
    await pay(byKey('partial-conflict'),'refund',409,'external provider cannot use simulated refund');
    await pay(byKey('invalid-payment'),'refund',409,'pending payment cannot refund');
    const seqBeforePay=await db.$queryRaw`SELECT sequencename,last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
    const noInventoryChanges=await db.$queryRaw`SELECT row_to_json(t)::text AS row FROM "InventoryMovement" t ORDER BY id`;
    const firstRefund=await pay(refund,'refund',201,'simulated demo refund');assert.equal(firstRefund.payment.status,'REFUNDED');assert.equal(firstRefund.replayed,false);
    const refundedState=await snapshot();await pay(refund,'refund',201,'simulated refund replay');assert.deepEqual(await snapshot(),refundedState);
    for(const kind of ['refund','report']){
      const rb=byKey(kind==='refund'?'refund-rollback':'partial-rollback'),before=await snapshot();rollbackPayment=true;
      await pay(rb,kind,500,'rollback payment '+kind);rollbackPayment=false;assert.deepEqual(await snapshot(),before,'payment atomic rollback '+kind);
      await pay(rb,kind,201,'retry after payment rollback '+kind);
      const lost=byKey(kind==='refund'?'refund-lost':'partial-lost');lostPayment=kind;await pay(lost,kind,503,'payment response lost '+kind);const committed=await snapshot();
      await pay(lost,kind,201,'payment retry recovers committed '+kind);assert.deepEqual(await snapshot(),committed);
      const race=byKey(kind==='refund'?'refund-race':'partial-race'),n=paymentCalls[kind];
      const results=await Promise.all([pay(race,kind,201,'concurrent payment '+kind+' A',{concurrent:true}),pay(race,kind,201,'concurrent payment '+kind+' B',{concurrent:true})]);
      assert.equal(paymentCalls[kind],n+2);assert.equal(results.filter(x=>!x.replayed).length,1);assert.equal(results.filter(x=>x.replayed).length,1);
    }
    lostPayment='inspect';const beforeRead=await snapshot();await pay(ext,'inspect',503,'inspection response lost');await pay(ext,'inspect',200,'inspection retry');assert.deepEqual(await snapshot(),beforeRead);
    assert.deepEqual(await db.$queryRaw`SELECT sequencename,last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`,seqBeforePay,'payment workflow does not consume sequences');
    assert.deepEqual(await db.$queryRaw`SELECT row_to_json(t)::text AS row FROM "InventoryMovement" t ORDER BY id`,noInventoryChanges,'payment workflow does not change physical inventory');
    assert.equal(externalHttpAttempts,0,'no external payment provider contacted');
    const tables=await rawTables(), map=new Map();
    const replace=str=>typeof str==='string'?str.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,id=>map.get(id)||id):str;
    const keys={Transaction:r=>r.operationId,InventoryReservation:r=>r.operationId,Payment:r=>r.operationId||r.transactionId,Receipt:r=>r.transactionId,
      WalletMovement:r=>[r.membershipId,r.authorizationId,r.kind,r.operationId].join(':'),RewardMovement:r=>[r.transactionId,r.kind,r.refundPaymentId,r.membershipId].join(':'),
      InventoryMovement:r=>[r.stationId,r.fuelId,r.sequence,r.kind].join(':'),PaymentEvent:r=>r.eventKey,MembershipDebt:r=>r.transactionId,BusinessAlert:r=>r.eventKey};
    for(const[table,key]of Object.entries(keys))for(const row of tables[table]||[])if(row.id&&!seededIds.has(row.id))map.set(row.id,'<'+table+':'+replace(key(row))+'>');
    function canonical(v){if(typeof v==='string')return replace(v);if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['createdAt','updatedAt','issuedAt','openedAt','registeredAt','occurredAt','lastUsedAt','reconciledAt','expiresAt'].includes(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}
    delete tables._prisma_migrations;
    const exportedSnapshot=Object.fromEntries(Object.entries(tables).map(([table,rows])=>[table,rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
    const seq=await db.$queryRaw`SELECT sequencename,last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
    fs.writeFileSync('/evidence/comparison-data.json',JSON.stringify({checks:checks.sort((a,b)=>a.label.localeCompare(b.label)),responses:responses.map(canonical).sort((a,b)=>a.label.localeCompare(b.label)),snapshot:exportedSnapshot,sequences:seq},null,2)+'\n');
    fs.writeFileSync('/evidence/integration-results.json',JSON.stringify({arm,checks:checks.length,engineCalls,baselineOrCandidateRealModule:true,paymentWorkflow:true,paymentCalls,externalHttpAttempts,rollbackPaymentVerified:true,lostPaymentResponseVerified:true,concurrentPaymentReplayVerified:true,inspectWithoutBusinessWritesVerified:true,syntheticFixtureCases:cases.length,
      migrationCount:(await db.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)[0].n,
      rollbackVerified:true,lostResponseReplayVerified:true,concurrentSingleSaleVerified:true,profileAndInventoryVerified:true,preAlertOutsideTransactionVerified:true,
      financialRows:await db.transaction.count(),receiptRows:await db.receipt.count(),sequences:seq,uuidMappingEntries:map.size,
      comparisonRules:['Original generated UUIDs correlated by table/natural identity; seeded business IDs remain fixed','Only lifecycle timestamps excluded','All financial fields, hashes, sequence values and relationships retained','Concurrent request labels may swap winner; evaluate exactly one fresh response and one replay']},null,2)+'\n');
    console.log(arm+': '+checks.length+' HTTP checks, rollback/replay/concurrency and stock verified');
  }finally{if(f)await f.app.close();if(store)await store.onModuleDestroy();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
