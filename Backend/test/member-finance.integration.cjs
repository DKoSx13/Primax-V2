// Synthetic HTTP/SQL/Redis parity only; never bootstraps an operational application.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
async function main() {
  let externalHttpAttempts = 0;
  global.fetch = async () => { externalHttpAttempts++; throw Error('External HTTP prohibited'); };
  const arm = process.env.ASTRA_ARM; assert(['baseline', 'candidate'].includes(arm));
  const root = '/tmp/astra-lot1e-finance-' + arm;
  fs.cpSync('/source', root, { recursive: true, filter: p => !path.relative('/source', p).split(path.sep).some(s => ['node_modules','dist','build','.cache'].includes(s) || s.startsWith('.env')) });
  fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
  require('/app/node_modules/ts-node').register({ project: root + '/tsconfig.json', transpileOnly: true });
  const { PrismaService } = require(root + '/src/prisma/prisma.service.ts');
  const { ConfigService } = require('/app/node_modules/@nestjs/config');
  const { KioskStore } = require(root + '/src/kiosk/redis-store.ts');
  const { KioskService } = require(root + '/src/kiosk/kiosk.service.ts');
  const { saleFixture } = require(root + '/test/commerce-sale.fixture.ts');
  const { WalletService } = require(root + '/src/wallet/wallet.service.ts');
  const { RewardsService } = require(root + '/src/rewards/rewards.service.ts');
  const { AuthorizationsService } = require(root + '/src/transactions/authorizations.service.ts');
  const request = require('/app/node_modules/supertest');
  const url = new URL(process.env.DATABASE_URL), secret = process.env.ASTRA_FIXTURE_SECRET;
  assert.equal(url.hostname, 'postgres'); assert.equal(url.port, '5432');
  assert.match(process.env.ASTRA_SYNTHETIC_DB, /^synthetic_[a-f0-9]{12}$/);
  assert.equal(url.pathname, '/' + process.env.ASTRA_SYNTHETIC_DB); assert.equal(url.username, process.env.ASTRA_SYNTHETIC_USER);
  assert.equal(process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL);
  assert.equal(new URL(process.env.KIOSK_REDIS_URL).hostname, 'redis'); assert.match(secret, /^[a-f0-9]{96}$/);
  const seeded = new Set();
  const id = label => { const h=crypto.createHash('sha256').update('SYNTHETIC-LOT1E:'+label).digest('hex'); const v=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);seeded.add(v);return v; };
  const technical = label => crypto.createHmac('sha256', secret).update(label).digest('hex');
  const station=id('station'), foreign=id('foreign-station');
  const session=Buffer.from(technical('session'),'hex').toString('base64url'), csrf=Buffer.from(technical('csrf'),'hex').toString('base64url');
  const db=new PrismaService(); let store,f;
  const checks=[],responses=[],calls={}; let lost='',rollback=false;
  const ignored=['createdAt','updatedAt','issuedAt','openedAt','registeredAt','occurredAt','lastUsedAt','reconciledAt','expiresAt','settledAt'];
  function stable(x) { if(Array.isArray(x))return x.map(stable);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k])=>!ignored.includes(k)).map(([k,v])=>[k,stable(v)]));return x; }
  async function tables() { const names=await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;const out={};for(const {tablename}of names){assert.match(tablename,/^[A-Za-z0-9_]+$/);out[tablename]=(await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t`)).map(x=>JSON.parse(x.row));}return out; }
  const snapshot=async()=>stable(await tables());
  const sequences=()=>db.$queryRaw`SELECT sequencename,last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
  try {
    const who=await db.$queryRaw`SELECT current_database() AS db,current_user AS role`;
    assert.equal(who[0].db,process.env.ASTRA_SYNTHETIC_DB);assert.equal(who[0].role,process.env.ASTRA_SYNTHETIC_USER);
    assert.equal((await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).length,0);
    const migration=spawnSync(process.execPath,['/app/node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{cwd:root,encoding:'utf8',env:process.env});
    fs.writeFileSync('/evidence/migrate.log',(migration.stdout||'')+(migration.stderr||''));assert.equal(migration.status,0);
    await db.station.createMany({data:[{id:station,code:'LAB',name:'Synthetic',address:'Synthetic'},{id:foreign,code:'OTHER',name:'Synthetic',address:'Synthetic'}]});
    await db.fuel.create({data:{id:id('fuel'),code:'LAB',name:'Synthetic',pricePerGallon:'20.00'}});
    const users=['owner','other','inactive','suspended','missing','cap','race-recharge','race-redeem','compete'];
    for(const key of users){await db.user.create({data:{id:id(key),email:key+'@synthetic.invalid',name:'Synthetic '+key,passwordHash:'not-a-login-fixture',active:key!=='inactive'}});
      if(key!=='missing')await db.membership.create({data:{id:id(key+'-member'),userId:id(key),number:'LAB-'+key,balance:key==='cap'?'9999999.98':'20.00',status:key==='suspended'?'SUSPENDED':'ACTIVE'}});
      if(key!=='missing'){
        const points=key==='compete'?30:100;
        await db.transaction.create({data:{id:id(key+'-earned-sale'),operationId:id(key+'-earned-op'),requestHash:'c'.repeat(64),plate:'AAA-001',membershipId:id(key+'-member'),stationId:station,fuelId:id('fuel'),amount:String(points*10)+'.00',unitPrice:'20.00',pointsRate:'0.1',pointsEarned:points,mode:'POSTPAGO',status:'PAID'}});
        await db.rewardMovement.create({data:{id:id(key+'-earn'),membershipId:id(key+'-member'),transactionId:id(key+'-earned-sale'),kind:'EARN',points}});
      }
    }
    for(const [key,cost,active]of [['benefit',30,true],['expensive',1000,true],['disabled',10,false],['alternate',30,true]])await db.benefit.create({data:{id:id(key),code:key,title:'Synthetic',description:'Synthetic',category:'Synthetic',pointsCost:cost,active}});
    // Fixed old/future timestamps avoid clock-boundary assertions; list is review only.
    for(const [key,status,stationId,age]of [['old','RESERVED',station,'2026-01-01'],['dispensing','DISPENSING',station,'2026-01-02'],['intervention','INTERVENTION_REQUIRED',station,'2026-01-03'],['foreign','RESERVED',foreign,'2026-01-04'],['released','RELEASED',station,'2026-01-05'],['settled','SETTLED',station,'2026-01-06'],['recent','RESERVED',station,'2099-01-01']])
      await db.fuelAuthorization.create({data:{id:id(key+'-auth'),operationId:id(key+'-op'),requestHash:'a'.repeat(64),plate:'AAA-001',stationId,fuelId:id('fuel'),membershipId:id('owner-member'),unitPrice:'20.00',authorizedAmount:'10.00',reservedAmount:'10.00',balanceAfter:'20.00',mode:'POSTPAGO',status,createdAt:new Date(age)}});
    for(const [i,amount]of [[1,'30.00'],[2,'40.00']]){
      await db.transaction.create({data:{id:id('debt-sale-'+i),operationId:id('historical-op-'+i),requestHash:'b'.repeat(64),plate:'AAA-001',membershipId:id('owner-member'),stationId:station,fuelId:id('fuel'),amount,unitPrice:'20.00',gallons:i===1?'1.500':'2.000',pointsRate:'0.1',pointsEarned:0,mode:'POSTPAGO',status:'PAYMENT_PENDING'}});
      await db.membershipDebt.create({data:{id:id('debt-'+i),membershipId:id('owner-member'),transactionId:id('debt-sale-'+i),amountOriginal:amount,amountPending:amount,createdAt:new Date('2026-01-0'+i)}});
      await db.payment.create({data:{id:id('debt-payment-'+i),transactionId:id('debt-sale-'+i),amount,method:'SALDO_PRIME',status:'PENDING',provider:'DEMO'}});
    }
    const config=new ConfigService({APP_MODE:'local',SOLES_PER_POINT:'10',CORS_ORIGINS:'http://localhost',KIOSK_GATEWAY_SECRET:secret,KIOSK_OPERATOR_USER:'synthetic',KIOSK_OPERATOR_PASSWORD_HASH:'not-a-login-fixture',KIOSK_STATION_ID:station,KIOSK_REDIS_URL:process.env.KIOSK_REDIS_URL,KIOSK_SESSION_NAMESPACE:process.env.ASTRA_NAMESPACE,KIOSK_API_KEY:technical('legacy')});
    store=new KioskStore(config);assert.equal(await store.command('DBSIZE'),0);
    const version=crypto.createHmac('sha256',secret).update(JSON.stringify(['synthetic','not-a-login-fixture',station,'1'])).digest('hex');
    const sessionKey=store.key('session:'+crypto.createHash('sha256').update(session).digest('hex'));
    const sessionValue=JSON.stringify({authenticated:true,csrf,version,stationId:station,expiresAt:Date.now()+300000});
    await store.command('SET',sessionKey,sessionValue,'EX',300,'NX');
    f=await saleFixture(db,config,new KioskService(config,store,db));
    for(const [engine,methods]of [[f.module.get(WalletService),['recharge','history']],[f.module.get(RewardsService),['redeem']],[f.module.get(AuthorizationsService),['status','pendingBefore']]])for(const method of methods){
      const original=engine[method].bind(engine);calls[method]=0;engine[method]=async(...args)=>{calls[method]++;const v=await original(...args);if(lost===method){lost='';const {ServiceUnavailableException}=require('/app/node_modules/@nestjs/common');throw new ServiceUnavailableException('Synthetic lost response after original return');}return v;};
    }
    const atomic=db.atomic.bind(db);db.atomic=work=>atomic(async tx=>{const v=await work(tx);if(rollback)throw Error('Synthetic failure before commit');return v;});
    const routes={recharge:'/api/v1/memberships/me/recharges',history:'/api/v1/memberships/me/wallet',redeem:'/api/v1/rewards/redeem',status:'/api/v1/authorizations/'+id('old-auth'),pendingBefore:'/api/v1/authorizations?olderThanMinutes=1'};
    async function call(method,status,label,o={}){
      const verb=['history','status','pendingBefore'].includes(method)?'GET':'POST',route=o.route||routes[method],body=o.body||{},actor=o.actor||(['status','pendingBefore'].includes(method)?'legacy':'owner');
      const req=request(f.app.getHttpServer())[verb.toLowerCase()](route);
      if(users.includes(actor)||['expired','stale'].includes(actor))req.set('Authorization','Bearer '+await f.jwt.signAsync({sub:id(['expired','stale'].includes(actor)?'owner':actor),ver:actor==='stale'?1:0},actor==='expired'?{expiresIn:-1}:{}));
      if(actor==='invalid')req.set('Authorization','Bearer invalid-synthetic');if(actor==='cookie')req.set('Cookie','primax_control='+await f.jwt.signAsync({sub:id('owner'),ver:0}));
      if(actor==='legacy'||actor==='bad-key')req.set('x-kiosk-key',actor==='legacy'?technical('legacy'):'bad');
      if(actor==='signed'){
        const stamp=String(Date.now()),xsrf=o.badCsrf?'wrong':csrf;
        const signature=crypto.createHmac('sha256',secret).update(JSON.stringify([verb,route,stamp,verb==='GET'?null:body,session,xsrf,'','',''])).digest('hex');
        req.set('x-kiosk-time',stamp).set('x-kiosk-session',session).set('x-csrf-token',xsrf).set('x-kiosk-signature',o.badSignature?'0'.repeat(64):signature);
      }
      const before=calls[method],r=await req.send(verb==='GET'?undefined:body);assert.equal(r.status,status,label+': '+JSON.stringify(r.body));
      if(o.noEngine)assert.equal(calls[method],before,label+' must not dispatch');else if(!o.concurrent)assert.equal(calls[method],before+1,label+' delegates once');
      if(status!==200&&status!==201)delete r.body.timestamp;checks.push({label,status});responses.push({label,body:r.body});return r.body;
    }
    const recharge=(key,amount='10.01')=>({operationId:id(key),amount}),redeem=key=>({operationId:id(key),benefitId:id('benefit')});
    const initial=await snapshot(),seqInitial=await sequences();
    for(const method of Object.keys(routes))for(const actor of ['anonymous','invalid','expired','stale','cookie','bad-key'])await call(method,401,method+' denies '+actor,{actor,noEngine:true});
    for(const method of ['recharge','history','redeem']){
      await call(method,401,method+' denies legacy',{actor:'legacy',noEngine:true});
      await call(method,403,method+' denies signed',{actor:'signed',noEngine:true});
      await call(method,403,method+' denies inactive user',{actor:'inactive',noEngine:true});
      await call(method,404,method+' missing membership',{actor:'missing',body:method==='redeem'?redeem('missing-redemption'):recharge('missing-recharge')});
    }
    for(const method of ['status','pendingBefore'])await call(method,401,method+' denies member',{actor:'owner',noEngine:true});
    await call('status',200,'signed own station status',{actor:'signed'});
    await call('status',403,'signed foreign station rejected',{actor:'signed',route:'/api/v1/authorizations/'+id('foreign-auth'),noEngine:true});
    await call('status',401,'status signature rejected',{actor:'signed',badSignature:true,noEngine:true});
    await call('status',403,'status CSRF rejected',{actor:'signed',badCsrf:true,noEngine:true});
    await call('pendingBefore',403,'signed list remains outside allowlist',{actor:'signed',noEngine:true});
    await call('status',200,'legacy foreign station observation preserved',{route:'/api/v1/authorizations/'+id('foreign-auth')});
    await call('status',400,'invalid authorization UUID',{route:'/api/v1/authorizations/invalid',noEngine:true});
    await call('status',404,'absent authorization',{route:'/api/v1/authorizations/'+id('absent-auth')});
    for(const query of ['', '?olderThanMinutes=0','?olderThanMinutes=-1','?olderThanMinutes=1.5','?olderThanMinutes=no'])await call('pendingBefore',400,'invalid pending query '+query,{route:'/api/v1/authorizations'+query,noEngine:true});
    const pending=await call('pendingBefore',200,'old pending list filters status age and order');assert.deepEqual(pending.map(r=>r.id),['old','dispensing','intervention','foreign'].map(k=>id(k+'-auth')));
    const wallet=await call('history',200,'wallet own debt and reservations');assert.equal(wallet.balance,'20.00');assert.equal(wallet.reserved,'50.00');assert.equal(wallet.total,'70.00');assert.equal(wallet.available,'20.00');assert.equal(wallet.pendingBalance,'70.00');
    const other=await call('history',200,'other owner sees own wallet only',{actor:'other'});assert.equal(other.pendingBalance,'0.00');assert.equal(other.reserved,'0.00');assert.deepEqual(other.movements,[]);
    await Promise.all([call('history',200,'concurrent history A',{concurrent:true}),call('history',200,'concurrent history B',{concurrent:true}),call('status',200,'concurrent status A',{concurrent:true}),call('status',200,'concurrent status B',{concurrent:true})]);
    assert.deepEqual(await snapshot(),initial,'all reads and guard failures preserve business rows');
    for(const amount of ['-1','1.001',1,'1000000','x'])await call('recharge',400,'recharge invalid amount '+amount,{body:recharge('invalid',amount),noEngine:true});
    await call('recharge',400,'recharge zero',{body:recharge('zero','0')});
    await call('recharge',400,'recharge unknown owner field rejected',{body:{...recharge('injected'),userId:id('other')},noEngine:true});
    await call('recharge',400,'recharge suspended membership',{actor:'suspended',body:recharge('suspended')});
    await call('recharge',400,'maximum balance exceeded',{actor:'cap',body:recharge('cap','0.02')});
    process.env.APP_MODE='production';await call('recharge',400,'production demo recharge disabled',{body:recharge('production')});process.env.APP_MODE='local';
    const first=await call('recharge',201,'FIFO partial debt settlement',{body:recharge('fifo','50.00')});assert.equal(first.debtPaid,'50.00');assert.equal(first.pendingBalance,'20.00');assert.equal(first.balance,'20.00');
    assert.equal((await db.membershipDebt.findUniqueOrThrow({where:{id:id('debt-1')}})).status,'SETTLED');assert.equal((await db.membershipDebt.findUniqueOrThrow({where:{id:id('debt-2')}})).status,'PARTIAL');
    let before=await snapshot();const replay=await call('recharge',201,'recharge replay retains original response shape',{body:recharge('fifo','50.00')});assert.equal(replay.replayed,true);assert.equal(replay.movement.id,first.movement.id);assert.equal('balance' in replay,false);
    await call('recharge',409,'recharge operation amount conflict',{body:recharge('fifo','50.01')});await call('recharge',409,'recharge operation owner conflict',{actor:'other',body:recharge('fifo','50.00')});assert.deepEqual(await snapshot(),before);
    const finalDebt=await call('recharge',201,'complete FIFO debt with free remainder',{body:recharge('fifo-final','30.00')});assert.equal(finalDebt.balance,'30.00');assert.equal(finalDebt.debtPaid,'20.00');assert.equal(finalDebt.pendingBalance,'0.00');
    for(const i of [1,2]){
      const debt=await db.membershipDebt.findUniqueOrThrow({where:{id:id('debt-'+i)}});assert.equal(debt.status,'SETTLED');assert(debt.amountPaid.eq(debt.amountOriginal));assert(debt.amountPending.isZero());
      assert.equal((await db.payment.findUniqueOrThrow({where:{id:id('debt-payment-'+i)}})).status,'CAPTURED');
      assert.equal((await db.transaction.findUniqueOrThrow({where:{id:id('debt-sale-'+i)}})).status,'PAID');
    }
    for(const method of ['recharge','redeem']){
      const body=method==='recharge'?recharge('rollback-recharge'):redeem('rollback-redeem');before=await snapshot();rollback=true;await call(method,500,method+' rollback after original writes',{body});rollback=false;assert.deepEqual(await snapshot(),before);await call(method,201,method+' explicit retry after rollback',{body});
      const lostBody=method==='recharge'?recharge('lost-recharge'):redeem('lost-redeem');lost=method;await call(method,503,method+' unknown response after commit',{body:lostBody});before=await snapshot();const r=await call(method,201,method+' explicit retry recovers original',{body:lostBody});assert.equal(r.replayed,true);assert.deepEqual(await snapshot(),before);
      const actor=method==='recharge'?'race-recharge':'race-redeem',raceBody=method==='recharge'?recharge('race-recharge'):redeem('race-redeem');
      const race=await Promise.all([call(method,201,'concurrent '+method+' A',{actor,body:raceBody,concurrent:true}),call(method,201,'concurrent '+method+' B',{actor,body:raceBody,concurrent:true})]);assert.equal(race.filter(x=>!x.replayed).length,1);assert.equal(race.filter(x=>x.replayed).length,1);
    }
    await call('redeem',400,'invalid benefit UUID',{body:{...redeem('bad-benefit'),benefitId:'bad'},noEngine:true});
    await call('redeem',400,'redeem owner injection rejected',{body:{...redeem('injected-redeem'),membershipId:id('other-member')},noEngine:true});
    for(const key of ['disabled','absent-benefit'])await call('redeem',404,'unavailable benefit '+key,{actor:'other',body:{...redeem('unavailable-'+key),benefitId:id(key)}});
    await call('redeem',400,'insufficient reward points',{actor:'other',body:{...redeem('expensive'),benefitId:id('expensive')}});
    await call('redeem',400,'suspended member cannot redeem',{actor:'suspended',body:redeem('suspended-redeem')});
    const normal=await call('redeem',201,'redeem emits coupon and debit',{actor:'other',body:redeem('normal-redeem')});assert.equal(normal.redemption.pointsSpent,30);assert.equal(normal.redemption.status,'ISSUED');
    before=await snapshot();const rr=await call('redeem',201,'redemption replay',{actor:'other',body:redeem('normal-redeem')});assert.equal(rr.redemption.id,normal.redemption.id);assert.equal(rr.replayed,true);
    await call('redeem',409,'redemption owner conflict',{body:redeem('normal-redeem')});await call('redeem',409,'redemption benefit conflict',{actor:'other',body:{...redeem('normal-redeem'),benefitId:id('alternate')}});assert.deepEqual(await snapshot(),before);
    await db.membership.update({where:{id:id('other-member')},data:{status:'SUSPENDED'}});const suspendedReplay=await call('redeem',201,'existing coupon replay precedes membership activity check',{actor:'other',body:redeem('normal-redeem')});assert.equal(suspendedReplay.replayed,true);
    // Both transactions read the same starting points. Hold B after its read until
    // A commits, so the original Serializable retry must re-read zero points.
    const { RewardsRepository }=require(root+'/src/rewards/rewards.repository.ts');
    const rewardsRepo=f.module.get(RewardsRepository),nativeBalance=rewardsRepo.balance.bind(rewardsRepo);
    assert.equal(rewardsRepo,f.module.get(RewardsService).repo);
    let reads=0,secondRead,firstCommit,firstRead;
    const firstArrived=new Promise(resolve=>firstRead=resolve),secondArrived=new Promise(resolve=>secondRead=resolve),firstCommitted=new Promise(resolve=>firstCommit=resolve);
    rewardsRepo.balance=async(member,tx)=>{const value=await nativeBalance(member,tx);if(member===id('compete-member')){const n=++reads;if(n===1){firstRead();await secondArrived;}if(n===2){secondRead();await firstCommitted;}}return value;};
    const rewardEngine=f.module.get(RewardsService),priorRedeem=rewardEngine.redeem.bind(rewardEngine);
    rewardEngine.redeem=async(user,dto)=>{const value=await priorRedeem(user,dto);if(dto.operationId===id('compete-A'))firstCommit();return value;};
    const competeA=call('redeem',201,'concurrent competing redemption A',{actor:'compete',body:redeem('compete-A'),concurrent:true});
    await Promise.race([firstArrived,new Promise((_,reject)=>setTimeout(()=>reject(Error('Contention first read not observed')),5000))]);
    const competeB=call('redeem',400,'concurrent competing redemption B',{actor:'compete',body:redeem('compete-B'),concurrent:true});
    await Promise.all([competeA,competeB]);rewardsRepo.balance=nativeBalance;rewardEngine.redeem=priorRedeem;
    assert(reads>=3,'loser retries and re-reads points');
    assert.equal(await db.redemption.count({where:{membershipId:id('compete-member')}}),1);
    assert.equal((await db.rewardMovement.aggregate({where:{membershipId:id('compete-member')},_sum:{points:true}}))._sum.points,0);
    for(const method of ['history','status','pendingBefore']){before=await snapshot();lost=method;await call(method,503,method+' response loss');await call(method,200,method+' retry');assert.deepEqual(await snapshot(),before);}
    assert.equal(await db.walletMovement.count({where:{operationId:id('race-recharge'),kind:'RECHARGE'}}),1);
    assert.equal(await db.redemption.count({where:{operationId:id('race-redeem')}}),1);
    assert.equal((await db.membership.findUniqueOrThrow({where:{id:id('owner-member')}})).balance.toFixed(2),'50.02');
    assert.equal((await db.membership.findUniqueOrThrow({where:{id:id('race-recharge-member')}})).balance.toFixed(2),'30.01');
    assert.equal((await db.rewardMovement.aggregate({where:{membershipId:id('owner-member')},_sum:{points:true}}))._sum.points,40);
    assert.deepEqual(await sequences(),seqInitial,'wallet/rewards/reads never issue receipts or operation numbers');assert.equal(await db.transaction.count(),10);assert.equal(await db.receipt.count(),10);assert.equal(await db.inventoryMovement.count(),0);
    assert.equal(externalHttpAttempts,0);assert.equal(await store.command('GET',sessionKey),sessionValue);
    const data=await tables(),map=new Map();
    const replace=s=>typeof s==='string'?s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,v=>map.get(v)||v):s;
    const keys={WalletMovement:r=>[r.membershipId,r.kind,r.operationId].join(':'),Redemption:r=>r.operationId,RewardMovement:r=>r.redemptionId,Receipt:r=>r.transactionId};
    for(const [table,key]of Object.entries(keys))for(const row of data[table]||[])if(row.id&&!seeded.has(row.id))map.set(row.id,'<'+table+':'+replace(key(row))+'>');
    // RewardMovement references the generated redemption: resolve after its mapping.
    for(const row of data.RewardMovement)if(!seeded.has(row.id))map.set(row.id,'<RewardMovement:'+replace(row.redemptionId)+'>');
    function canonical(v){if(typeof v==='string')return replace(v);if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(stable(v)).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}
    delete data._prisma_migrations;
    // Check native createdAt DESC/id DESC history ordering independently in each arm.
    const finalWallet=await f.module.get(WalletService).history(id('owner'));
    const nativeRows=await db.walletMovement.findMany({where:{membershipId:id('owner-member')},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100});assert.deepEqual(finalWallet.movements.map(m=>m.id),nativeRows.map(m=>m.id));
    fs.writeFileSync('/evidence/comparison-data.json',JSON.stringify({checks:checks.sort((a,b)=>a.label.localeCompare(b.label)),responses:responses.map(canonical).sort((a,b)=>a.label.localeCompare(b.label)),snapshot:Object.fromEntries(Object.entries(data).map(([k,rows])=>[k,rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])),sequences:await sequences()},null,2)+'\n');
    fs.writeFileSync('/evidence/integration-results.json',JSON.stringify({arm,checks:checks.length,calls,externalHttpAttempts,migrationCount:(await db.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)[0].n,financialRows:10,receiptRows:10,sequences:await sequences(),uuidMappingEntries:map.size,rollbackVerified:true,lostResponseReplayVerified:true,concurrentSingleEffectVerified:true,FIFOSettlementVerified:true,readOnlyVerified:true,ownerAndStationVerified:true,legacyStationLimitationPreserved:true,originalHistoryOrderingVerified:true,comparisonRules:['All seeded IDs fixed; coordinated competing redemptions use the same interleaving','Generated IDs by table and natural identity; all balances, points, hashes and links retained','Lifecycle timestamps only excluded','Concurrent labels can swap replay winner; no financial fields removed']},null,2)+'\n');
    console.log(arm+': '+checks.length+' HTTP finance/read checks verified');
  } finally {if(f)await f.app.close();if(store)await store.onModuleDestroy();await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
