const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
async function main(){
  let externalHttpAttempts=0;global.fetch=async()=>{externalHttpAttempts++;throw Error('External HTTP prohibited');};
  const arm=process.env.ASTRA_ARM,family=process.env.ASTRA_TEST_FAMILY;assert(['baseline','candidate'].includes(arm));
  const root='/tmp/astra-lot1f-'+family+'-'+arm;
  fs.cpSync('/source',root,{recursive:true,filter:p=>!path.relative('/source',p).split(path.sep).some(s=>['node_modules','dist','build','.cache'].includes(s)||s.startsWith('.env'))});
  fs.symlinkSync('/app/node_modules',root+'/node_modules','dir');
  require('/app/node_modules/ts-node').register({project:root+'/tsconfig.json',transpileOnly:true});
  const {PrismaService}=require(root+'/src/prisma/prisma.service.ts'),{ConfigService}=require('/app/node_modules/@nestjs/config'),{JwtService}=require('/app/node_modules/@nestjs/jwt');
  const {KioskStore}=require(root+'/src/kiosk/redis-store.ts'),{operationalFixture}=require(root+'/test/operational-workflow.fixture.ts');
  const request=require('/app/node_modules/supertest'),db=new PrismaService();let store,f;
  const url=new URL(process.env.DATABASE_URL),secret=process.env.ASTRA_FIXTURE_SECRET;
  assert.equal(url.hostname,'postgres');assert.equal(url.port,'5432');assert.match(process.env.ASTRA_SYNTHETIC_DB,/^synthetic_[a-f0-9]{12}$/);assert.equal(url.pathname,'/'+process.env.ASTRA_SYNTHETIC_DB);assert.equal(url.username,process.env.ASTRA_SYNTHETIC_USER);assert.equal(process.env.DATABASE_URL_UNPOOLED,process.env.DATABASE_URL);assert.equal(new URL(process.env.KIOSK_REDIS_URL).hostname,'redis');assert.match(secret,/^[a-f0-9]{96}$/);
  const seeded=new Set(),id=label=>{const h=crypto.createHash('sha256').update('SYNTHETIC-LOT1F:'+label).digest('hex');const v=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);seeded.add(v);return v;};
  const technical=label=>crypto.createHmac('sha256',secret).update(label).digest('hex'),digest=v=>crypto.createHash('sha256').update(v).digest('hex');
  const checks=[],responses=[],dispatch={};let rollback=false,lost='';
  const times=['createdAt','updatedAt','issuedAt','openedAt','registeredAt','occurredAt','lastUsedAt','reconciledAt','expiresAt','settledAt','acceptedAt','resolvedAt','escalatedAt','cancelledAt','closedAt','endedAt','revokedAt','grantedAt','startedAt','emailVerifiedAt','assignedAt'];
  function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,times.includes(k)?(x===null?null:'<lifecycle-time>'):stable(x)]));return v;}
  async function tables(){const names=await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;const out={};for(const{tablename}of names){assert.match(tablename,/^[A-Za-z0-9_]+$/);out[tablename]=(await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t ORDER BY 1`)).map(x=>JSON.parse(x.row));}return out;}
  const snapshot=async()=>stable(await tables()),sequences=()=>db.$queryRaw`SELECT sequencename,last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
  try{
    const who=await db.$queryRaw`SELECT current_database() AS db,current_user AS role`;assert.equal(who[0].db,process.env.ASTRA_SYNTHETIC_DB);assert.equal(who[0].role,process.env.ASTRA_SYNTHETIC_USER);assert.equal((await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).length,0);
    const migrate=spawnSync(process.execPath,['/app/node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{cwd:root,encoding:'utf8',env:process.env});fs.writeFileSync('/evidence/migrate.log',(migrate.stdout||'')+(migrate.stderr||''));assert.equal(migrate.status,0);
    for(const key of ['A','B'])await db.station.create({data:{id:id('station-'+key),code:key,name:'Synthetic '+key,address:'Synthetic'}});
    await db.fuel.create({data:{id:id('fuel'),code:'LAB',name:'Synthetic',pricePerGallon:'20.00'}});
    await db.fuelInventory.create({data:{stationId:id('station-A'),fuelId:id('fuel'),liters:'1000.000'}});
    for(const key of ['root','manager','viewer','outsider','staff','member','target','inactive']){
      await db.user.create({data:{id:id(key),email:key+'@synthetic.invalid',name:'Synthetic '+key,passwordHash:'not-a-login-fixture',active:key!=='inactive'}});
      if(['manager','viewer','outsider','staff'].includes(key)){
        const account=await db.adminControlAccount.create({data:{id:id(key+'-account'),userId:id(key),role:'ENCARGADO',status:'APPROVED',emailVerifiedAt:new Date('2026-01-01')}});
        await db.adminStationAssignment.create({data:{id:id(key+'-station'),userId:id(key),accountId:account.id,stationId:id('station-'+(key==='outsider'?'B':'A')),reason:'Synthetic'}});
        for(const permission of ['ADMIN_CONTROL_ACCESS','ADMIN_INCIDENT_VIEW',...(key==='viewer'?[]:['ADMIN_INCIDENT_MANAGE'])])await db.adminControlGrant.create({data:{id:id(key+'-'+permission),userId:id(key),permission,reason:'Synthetic'}});
      }
    }
    await db.userPermissionGrant.create({data:{id:id('root-grant'),userId:id('root'),permission:'SYSTEM_ADMIN',reason:'Synthetic'}});
    await db.membership.create({data:{id:id('member-membership'),userId:id('member'),number:'LAB-MEMBER',balance:'50.00'}});
    const terminals={};for(const key of ['main','other','race','rollback','lost','resolve','cancel','ticket','blocked','unassigned']){
      const stationId=id('station-'+(key==='other'?'B':'A')),terminalId=id(key+'-terminal'),pumpId=id(key+'-pump');
      await db.pump.create({data:{id:pumpId,stationId,code:'P-'+key.toUpperCase(),name:'Synthetic'}});
      await db.terminal.create({data:{id:terminalId,stationId,code:'T-'+key.toUpperCase()}});
      if(key!=='unassigned')await db.terminalPumpAssignment.create({data:{id:id(key+'-assignment'),stationId,terminalId,pumpId,startedAt:new Date('2026-01-01')}});
      const token=technical('credential-'+key);await db.terminalCredential.create({data:{id:id(key+'-credential'),terminalId,tokenHash:digest(token),expiresAt:new Date('2099-01-01')}});
      terminals[key]={key,stationId,terminalId,pumpId,token,owner:id(key+'-owner')};
    }
    const config=new ConfigService({APP_MODE:'local',SOLES_PER_POINT:'10',CORS_ORIGINS:'http://localhost',JWT_SECRET:secret,KIOSK_GATEWAY_SECRET:secret,KIOSK_OPERATOR_USER:'synthetic',KIOSK_OPERATOR_PASSWORD_HASH:'not-a-login-fixture',KIOSK_STATION_ID:id('station-A'),KIOSK_REDIS_URL:process.env.KIOSK_REDIS_URL,KIOSK_SESSION_NAMESPACE:process.env.ASTRA_NAMESPACE,KIOSK_API_KEY:technical('legacy'),PASSWORD_RESET_DELIVERY:'disabled'});
    store=new KioskStore(config);assert.equal(await store.command('DBSIZE'),0);
    const jwt=new JwtService({secret,signOptions:{expiresIn:'1h',issuer:'primax-v6',audience:'primax-prime',algorithm:'HS256'},verifyOptions:{issuer:'primax-v6',audience:'primax-prime',algorithms:['HS256']}});
    f=await operationalFixture(db,config,store,jwt);
    const {OperationsService}=require(root+'/src/operations/operations.service.ts'),{AssistanceService}=require(root+'/src/assistance/assistance.service.ts'),{ControlPaymentsService}=require(root+'/src/operations/control-payments.ts');
    const operations=f.module.get(OperationsService),assistance=f.module.get(AssistanceService),payments=f.module.get(ControlPaymentsService),kiosk=f.kiosk;
    for(const [key,engine,methods]of [['operations',operations,['terminalMe','startOperation','operation','recoveryState','closeOperation','cancelUnpaidOperation','resolveOperation','grantAdmin','revokeAdminGrant','createPump','createTerminal','assignTerminal','endTerminalAssignment','revokeTerminal']],['assistance',assistance,['create','terminalStatus','cancel','list','detail','act']],['payments',payments,['detail','act']],['kiosk',kiosk,['claimTerminal','issueRecoveryTicket']]])for(const method of methods){const original=engine[method].bind(engine),label=key+'.'+method;dispatch[label]=0;engine[method]=async(...args)=>{dispatch[label]++;const v=await original(...args);if(lost===label){lost='';const{ServiceUnavailableException}=require('/app/node_modules/@nestjs/common');throw new ServiceUnavailableException('Synthetic response lost after original return');}return v;};}
    const atomic=db.atomic.bind(db);db.atomic=(work,options)=>atomic(async tx=>{const v=await work(tx);if(rollback)throw Error('Synthetic failure before commit');return v;},options);
    async function call(verb,route,status,label,o={}){
      const req=request(f.app.getHttpServer())[verb.toLowerCase()](route),body=o.body||{},actor=o.actor||'root',t=terminals[o.terminal||'main'];
      if(['root','manager','viewer','outsider','staff','member','inactive','target','expired','stale'].includes(actor))req.set('Authorization','Bearer '+await jwt.signAsync({sub:id(['expired','stale'].includes(actor)?'root':actor),ver:actor==='stale'?1:0},actor==='expired'?{expiresIn:-1}:{}));
      if(actor==='invalid')req.set('Authorization','Bearer invalid-synthetic');if(actor==='cookie')req.set('Cookie','primax_control='+await jwt.signAsync({sub:id(o.cookieUser||'manager'),ver:0}));if(actor==='legacy')req.set('x-kiosk-key',technical('legacy'));
      if(actor==='terminal'){
        const stamp=String(Date.now()),token=o.token??t.token,owner=o.owner??t.owner;
        const sig=crypto.createHmac('sha256',secret).update(JSON.stringify([verb,route,stamp,verb==='GET'?null:body,'','',token,'',owner])).digest('hex');
        req.set('x-kiosk-time',stamp).set('x-terminal-session',token).set('x-terminal-owner',owner).set('x-kiosk-signature',o.badSignature?'0'.repeat(64):sig);
      }
      const before=o.engine?dispatch[o.engine]:0,r=await req.send(verb==='GET'?undefined:body);assert(Array.isArray(status)?status.includes(r.status):r.status===status,label+': expected '+JSON.stringify(status)+' got '+r.status+' '+JSON.stringify(r.body));
      if(o.engine&&!o.concurrent)assert.equal(dispatch[o.engine],before+(o.noEngine?0:1),label+' exact frontier dispatch');
      if(route.endsWith('/recovery-ticket')&&r.status<400)assert.equal(r.headers['cache-control'],'no-store');
      if(r.status>=400)delete r.body.timestamp;checks.push({label,status:r.status});responses.push({label,body:r.body});return r.body;
    }
    async function seedOperation(key,patch={}){const t=terminals[key];return db.terminalOperation.create({data:{id:id(key+'-operation-row'),operationId:id(key+'-operation'),stationId:t.stationId,terminalId:t.terminalId,pumpId:t.pumpId,terminalPumpAssignmentId:id(key+'-assignment'),...patch}});}
    async function createDemoOrder(key){
      await seedOperation(key);const t=terminals[key];
      const {OnlineOrdersService}=require(root+'/src/payments/online-orders.ts');
      return f.module.get(OnlineOrdersService).create({operationId:id(key+'-operation'),method:'YAPE',authorization:{operationId:id(key+'-operation'),stationId:t.stationId,fuelId:id('fuel'),plate:'AAA-001',amount:'60.00',unitPrice:'20.00',mode:'PREPAGO',paymentMethod:'YAPE',receiptType:'BOLETA'}},{kind:'kiosk',stationId:t.stationId});
    }
    const flags={};const context={db,store,f,root,assert,id,technical,digest,terminals,operations,assistance,payments,kiosk,call,snapshot,sequences,seedOperation,createDemoOrder,flags,checks,responses,dispatch,rollback:v=>rollback=v,lose:method=>lost=method};
    await require(root+'/test/operational-scenarios/'+family+'.cjs')(context);
    assert.equal(externalHttpAttempts,0);
    const data=await tables(),map=new Map();
    const replace=s=>typeof s==='string'?(map.get(s)||s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,v=>map.get(v)||v).replace(/[a-f0-9]{64}/g,v=>map.get(v)||v)):s;
    const keys={InventoryMovement:r=>[r.stationId,r.fuelId,r.sequence,r.kind].join(':'),Pump:r=>[r.stationId,r.code].join(':'),Terminal:r=>[r.stationId,r.code].join(':'),UserPermissionGrant:r=>[r.userId,r.permission,r.reason].join(':'),TerminalPumpAssignment:r=>[r.terminalId,r.pumpId].join(':'),TerminalOperation:r=>r.operationId,AssistanceRequest:r=>r.requestId,OperationalIncident:r=>r.eventKey,Payment:r=>r.operationId,OnlineOrder:r=>r.operationId,InventoryReservation:r=>r.operationId,Transaction:r=>r.operationId,Receipt:r=>r.transactionId,PaymentEvent:r=>r.eventKey};
    for(const[table,key]of Object.entries(keys))for(const row of data[table]||[])if(row.id&&!seeded.has(row.id))map.set(row.id,'<'+table+':'+replace(key(row))+'>');
    // Audit keys are random append-only identities, correlated by action/target/outcome/ordinal.
    const ordinals={};for(const row of data.OperationalAuditEvent||[]){const identity=[row.action,replace(row.targetId),row.outcome,replace(row.actorUserId),crypto.createHash('sha256').update(replace(JSON.stringify(stable(row.details)))).digest('hex').slice(0,12)].join(':'),n=ordinals[identity]=(ordinals[identity]||0)+1;map.set(row.id,'<Audit:'+identity+':'+n+'>');map.set(row.eventKey,'<AuditKey:'+identity+':'+n+'>');}
    const redisRows=[];let cursor='0';do{const r=await store.command('SCAN',cursor,'MATCH',store.key('*'),'COUNT',1000);cursor=r[0];for(const key of r[1]){const type=await store.command('TYPE',key);redisRows.push({key:key.replace(process.env.ASTRA_NAMESPACE,'<namespace>'),type,value:type==='string'?await store.command('GET',key):'<'+type+'>',positiveTtl:(await store.command('TTL',key))>0});}}while(cursor!=='0');
    for(const row of redisRows)if(row.key.includes('recovery-pending:'))map.set(row.value,'<RecoveryTicketHash:'+row.key.split('recovery-pending:')[1]+'>');
    for(const r of responses)if(r.body?.ticket){map.set(r.body.ticket,'<RecoveryTicket:'+r.body.operationId+'>');map.set(digest(r.body.ticket),'<RecoveryTicketHash:'+r.body.terminalId+'>');}
    function canonical(v){if(typeof v==='string'){if(v.startsWith('{')||v.startsWith('[')){try{return JSON.stringify(canonical(JSON.parse(v)));}catch{}}return replace(v);}if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(stable(v)).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}
    delete data._prisma_migrations;
    const seq=await sequences(),result={checks:checks.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),responses:responses.map(canonical).sort((a,b)=>a.label.localeCompare(b.label)),snapshot:Object.fromEntries(Object.entries(data).map(([table,rows])=>[table,rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])),sequences:seq,redis:redisRows.map(canonical).sort((a,b)=>a.key.localeCompare(b.key))};
    fs.writeFileSync('/evidence/comparison-data.json',JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync('/evidence/integration-results.json',JSON.stringify({arm,family,checks:checks.length,dispatch,flags,externalHttpAttempts,migrations:36,financialRows:await db.transaction.count(),receipts:await db.receipt.count(),sequences:seq,uuidMappingEntries:map.size,redisKeys:redisRows.length,realModules:true,comparisonRules:['Seeded IDs literal; generated IDs by table/natural key','Audit random keys by action/target/outcome/actor/ordinal','Lifecycle times excluded; state, financial fields, links and sequences retained','Redis TTL checked positive instead of equal elapsed seconds']},null,2)+'\n');
    console.log(arm+': '+family+' '+checks.length+' HTTP checks and SQL/Redis snapshots verified');
  }finally{if(f)await f.app.close();else if(store)await store.onModuleDestroy();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
