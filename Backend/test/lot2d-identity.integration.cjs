const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
async function main(){
  let externalHttpAttempts=0,ocrCalls=0,ocrReply={plate:'AAA-001',confidence:0.99},ocrFailure=false;
  global.fetch=async(url,options)=>{assert.equal(String(url),'http://synthetic-ocr:8000/recognize');ocrCalls++;if(ocrFailure)throw Error('Synthetic OCR unavailable');return {ok:true,json:async()=>ocrReply};};
  const arm=process.env.ASTRA_ARM,family=process.env.ASTRA_TEST_FAMILY;assert(['baseline','candidate'].includes(arm));
  const root='/tmp/astra-lot2-'+family+'-'+arm;
  fs.cpSync('/source',root,{recursive:true,filter:p=>!path.relative('/source',p).split(path.sep).some(s=>['node_modules','dist','build','.cache'].includes(s)||s.startsWith('.env'))});
  fs.symlinkSync('/app/node_modules',root+'/node_modules','dir');
  require('/app/node_modules/ts-node').register({project:root+'/tsconfig.json',transpileOnly:true});
  const {PrismaService}=require(root+'/src/prisma/prisma.service.ts'),{ConfigService}=require('/app/node_modules/@nestjs/config'),{JwtService}=require('/app/node_modules/@nestjs/jwt');
  const {KioskStore}=require(root+'/src/kiosk/redis-store.ts'),{lot2Fixture}=require(root+'/test/lot2-identity.fixture.ts');
  const request=require('/app/node_modules/supertest'),db=new PrismaService();let store,f;
  const url=new URL(process.env.DATABASE_URL),secret=process.env.ASTRA_FIXTURE_SECRET;
  assert.equal(url.hostname,'postgres');assert.equal(url.port,'5432');assert.match(process.env.ASTRA_SYNTHETIC_DB,/^synthetic_[a-f0-9]{12}$/);assert.equal(url.pathname,'/'+process.env.ASTRA_SYNTHETIC_DB);assert.equal(url.username,process.env.ASTRA_SYNTHETIC_USER);assert.equal(process.env.DATABASE_URL_UNPOOLED,process.env.DATABASE_URL);assert.equal(new URL(process.env.KIOSK_REDIS_URL).hostname,'redis');assert.match(secret,/^[a-f0-9]{96}$/);
  const seeded=new Set(),id=label=>{const h=crypto.createHash('sha256').update('SYNTHETIC-LOT2:'+label).digest('hex');const v=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);seeded.add(v);return v;};
  const technical=label=>crypto.createHmac('sha256',secret).update(label).digest('hex'),digest=v=>crypto.createHash('sha256').update(v).digest('hex');
  const checks=[],responses=[],dispatch={},passwords=new Map(),deliveries=new Map();let rollback=false,lost='';
  const {hash:passwordHash,compare}=require('/app/node_modules/bcryptjs');const seedPassword='Synthetic1!';const seedHash=await passwordHash(seedPassword,'$2b$04$abcdefghijklmnopqrstuu');
  const times=['createdAt','updatedAt','issuedAt','openedAt','registeredAt','occurredAt','lastUsedAt','reconciledAt','expiresAt','settledAt','acceptedAt','resolvedAt','escalatedAt','cancelledAt','closedAt','endedAt','revokedAt','grantedAt','startedAt','emailVerifiedAt','assignedAt','usedAt','verifiedAt','terminalExpiresAt'];
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
      await db.user.create({data:{id:id(key),email:key+'@synthetic.invalid',name:'Synthetic '+key,passwordHash:seedHash,active:key!=='inactive'}});
      passwords.set(key+'@synthetic.invalid',seedPassword);
      if(['manager','viewer','outsider','staff'].includes(key)){
        const account=await db.adminControlAccount.create({data:{id:id(key+'-account'),userId:id(key),role:'ENCARGADO',status:'APPROVED',emailVerifiedAt:new Date('2026-01-01')}});
        await db.adminStationAssignment.create({data:{id:id(key+'-station'),userId:id(key),accountId:account.id,stationId:id('station-'+(key==='outsider'?'B':'A')),reason:'Synthetic'}});
        for(const permission of ['ADMIN_CONTROL_ACCESS','ADMIN_INCIDENT_VIEW',...(key==='viewer'?[]:['ADMIN_INCIDENT_MANAGE','ADMIN_INVENTORY_VIEW'])])await db.adminControlGrant.create({data:{id:id(key+'-'+permission),userId:id(key),permission,reason:'Synthetic'}});
      }
    }
    await db.userPermissionGrant.create({data:{id:id('root-grant'),userId:id('root'),permission:'SYSTEM_ADMIN',reason:'Synthetic'}});
    await db.membership.create({data:{id:id('member-membership'),userId:id('member'),number:'PRIM000111',balance:'50.00'}});
    const terminals={};for(const key of ['main','other','race','rollback','lost','resolve','cancel','ticket','blocked','unassigned']){
      const stationId=id('station-'+(key==='other'?'B':'A')),terminalId=id(key+'-terminal'),pumpId=id(key+'-pump');
      await db.pump.create({data:{id:pumpId,stationId,code:'P-'+key.toUpperCase(),name:'Synthetic'}});
      await db.terminal.create({data:{id:terminalId,stationId,code:'T-'+key.toUpperCase()}});
      if(key!=='unassigned')await db.terminalPumpAssignment.create({data:{id:id(key+'-assignment'),stationId,terminalId,pumpId,startedAt:new Date('2026-01-01')}});
      const token=technical('credential-'+key);await db.terminalCredential.create({data:{id:id(key+'-credential'),terminalId,tokenHash:digest(token),expiresAt:new Date('2099-01-01')}});
      terminals[key]={key,stationId,terminalId,pumpId,token,owner:id(key+'-owner')};
    }
    await db.membership.create({data:{id:id('target-membership'),userId:id('target'),number:'PRIM000222',balance:'0.00'}});
    await db.membershipCodeAlias.create({data:{membershipId:id('member-membership'),code:'PRIME-111'}});
    for(const [key,plate,member]of [['member','AAA-001','member'],['target','BBB-002','target'],['guest','CCC-003',null]])await db.vehicle.create({data:{id:id(key+'-vehicle'),plate,label:'Synthetic',membershipId:member?id(member+'-membership'):null}});
    await db.benefit.create({data:{id:id('benefit'),code:'LAB',title:'Synthetic',description:'Synthetic',category:'Synthetic',pointsCost:30}});
    const config=new ConfigService({APP_MODE:'local',SOLES_PER_POINT:'10',CORS_ORIGINS:'http://localhost',JWT_SECRET:secret,KIOSK_GATEWAY_SECRET:secret,KIOSK_OPERATOR_USER:'synthetic',KIOSK_OPERATOR_PASSWORD_HASH:seedHash,KIOSK_STATION_ID:id('station-A'),KIOSK_REDIS_URL:process.env.KIOSK_REDIS_URL,KIOSK_SESSION_NAMESPACE:process.env.ASTRA_NAMESPACE,KIOSK_API_KEY:technical('legacy'),PASSWORD_RESET_DELIVERY:'disabled',PLATE_RECOGNITION_URL:'http://synthetic-ocr:8000',OCR_SERVICE_SECRET:technical('ocr'),PLATE_RECOGNITION_ENABLED:'true',ADMIN_USER:'synthetic-admin',ADMIN_PASSWORD_HASH:seedHash,SHOW_DEMO_ADMIN_CREDENTIALS:'false'});
    store=new KioskStore(config);assert.equal(await store.command('DBSIZE'),0);
    const jwt=new JwtService({secret,signOptions:{expiresIn:'1h',issuer:'primax-v6',audience:'primax-prime',algorithm:'HS256'},verifyOptions:{issuer:'primax-v6',audience:'primax-prime',algorithms:['HS256']}});
    f=await lot2Fixture(db,config,store,jwt);
    const get=source=>require(root+'/src/'+source+'.ts');
    const auth=f.module.get(get('auth/auth.service').AuthService),reset=f.module.get(get('auth/password-reset.service').PasswordResetService),members=f.module.get(get('memberships/memberships.service').MembershipsService),vehicles=f.module.get(get('vehicles/vehicles.service').VehiclesService),alerts=f.module.get(get('alerts/alerts.service').AlertsService),recognition=f.module.get(get('vehicles/recognition.service').RecognitionService),kiosk=f.kiosk;
    const delivery=f.module.get(get('auth/recovery-delivery').RecoveryDelivery);delivery.send=async(email,code,expiresAt)=>{deliveries.set(email,{code,expiresAt});};
    for(const [key,engine,methods]of [['auth',auth,['register','login']],['reset',reset,['forgot','verify','reset']],['profile',members,['updateProfile']],['vehicle',vehicles,['create']],['alerts',alerts,['list','dashboard','resolve','checkPlate']],['recognition',recognition,['recognize']],['kiosk',kiosk,['status','login','bootstrapTerminal','exchangeRecoveryTicket','logout','authorize']]])for(const method of methods){const original=engine[method].bind(engine),label=key+'.'+method;dispatch[label]=0;engine[method]=async(...args)=>{dispatch[label]++;const v=await original(...args);if(lost===label){lost='';const{ServiceUnavailableException}=require('/app/node_modules/@nestjs/common');throw new ServiceUnavailableException('Synthetic response lost after original return');}return v;};}
    const transaction=db.$transaction.bind(db);db.$transaction=(work,options)=>typeof work==='function'?transaction(async tx=>{const value=await work(tx);if(rollback)throw Error('Synthetic failure before original transaction commit');return value;},options):transaction(work,options);
    async function call(verb,route,status,label,o={}){
      const req=request(f.app.getHttpServer())[verb.toLowerCase()](route),body=o.body||{},actor=o.actor||'root',t=terminals[o.terminal||'main'];
      if(o.bearer)req.set('Authorization','Bearer '+o.bearer);
      if(['root','manager','viewer','outsider','staff','member','inactive','target','expired','stale'].includes(actor))req.set('Authorization','Bearer '+await jwt.signAsync({sub:id(['expired','stale'].includes(actor)?'root':actor),ver:actor==='stale'?1:0},actor==='expired'?{expiresIn:-1}:{}));
      if(actor==='invalid')req.set('Authorization','Bearer invalid-synthetic');if(actor==='cookie')req.set('Cookie','primax_control='+await jwt.signAsync({sub:id(o.cookieUser||'manager'),ver:0}));if(actor==='legacy')req.set('x-kiosk-key',technical('legacy'));
      if(actor==='terminal'||actor==='signed'){
        const stamp=String(Date.now()),token=o.token??(actor==='signed'?'':t.token),owner=o.owner??(actor==='signed'?'':t.owner),session=o.session||'',csrf=o.csrf||'';
        const sig=crypto.createHmac('sha256',secret).update(JSON.stringify([verb,route,stamp,verb==='GET'?null:body,session,csrf,token,'',owner])).digest('hex');
        req.set('x-kiosk-time',stamp).set('x-kiosk-session',session).set('x-csrf-token',csrf).set('x-terminal-session',token).set('x-terminal-owner',owner).set('x-kiosk-signature',o.badSignature?'0'.repeat(64):sig);
      }
      const before=o.engine?dispatch[o.engine]:0,r=await req.send(verb==='GET'?undefined:body);assert(Array.isArray(status)?status.includes(r.status):r.status===status,label+': expected '+JSON.stringify(status)+' got '+r.status+' '+JSON.stringify(r.body));
      if(o.engine&&!o.concurrent)assert.equal(dispatch[o.engine],before+(o.noEngine?0:1),label+' exact frontier dispatch');
      if(route.endsWith('/recovery-ticket')&&r.status<400)assert.equal(r.headers['cache-control'],'no-store');
      if(r.status>=400)delete r.body.timestamp;checks.push({label,status:r.status});responses.push({label,body:r.body});return r.body;
    }
    const flags={};const context={db,store,f,root,config,assert,id,technical,digest,terminals,auth,reset,members,vehicles,alerts,recognition,kiosk,call,snapshot,sequences,flags,checks,responses,dispatch,passwords,deliveries,seedPassword,seedHash,rollback:v=>rollback=v,lose:method=>lost=method,ocr:(reply,failure=false)=>{ocrReply=reply;ocrFailure=failure;}};
    await require(family==='kiosk'?root+'/test/lot2c-kiosk-scenario.cjs':family==='admin-ocr'?root+'/test/lot2d-admin-scenario.cjs':root+'/test/lot2-scenarios/'+family+'.cjs')(context);
    assert.equal(externalHttpAttempts,0);
    const data=await tables(),map=new Map();
    const replace=s=>typeof s==='string'?(map.get(s)||s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,v=>map.get(v)||v).replace(/[a-f0-9]{64}/g,v=>map.get(v)||v)):s;
    const keys={User:r=>r.email,Membership:r=>r.userId,MembershipCodeAlias:r=>r.code,Vehicle:r=>r.plate,PasswordReset:r=>r.userId,BusinessAlert:r=>r.eventKey,TerminalCredential:r=>r.tokenHash,InventoryMovement:r=>[r.stationId,r.fuelId,r.sequence,r.kind].join(':'),Pump:r=>[r.stationId,r.code].join(':'),Terminal:r=>[r.stationId,r.code].join(':'),UserPermissionGrant:r=>[r.userId,r.permission,r.reason].join(':'),TerminalPumpAssignment:r=>[r.terminalId,r.pumpId].join(':'),TerminalOperation:r=>r.operationId,AssistanceRequest:r=>r.requestId,OperationalIncident:r=>r.eventKey,Payment:r=>r.operationId,OnlineOrder:r=>r.operationId,InventoryReservation:r=>r.operationId,Transaction:r=>r.operationId,Receipt:r=>r.transactionId,PaymentEvent:r=>r.eventKey};
    for(const[table,key]of Object.entries(keys))for(const row of data[table]||[])if(row.id&&!seeded.has(row.id))map.set(row.id,'<'+table+':'+replace(key(row))+'>');
    for(const row of data.User){const expected=passwords.get(row.email);assert(expected,'Expected password assertion missing for '+row.email);assert(await compare(expected,row.passwordHash));map.set(row.passwordHash,'<VerifiedBcrypt:'+row.email+'>');}
    for(const row of data.PasswordReset){const user=data.User.find(u=>u.id===row.userId),sent=deliveries.get(user.email);if(sent){assert.equal(row.codeHash,crypto.createHmac('sha256',secret).update('v10-reset-code:'+row.id+':'+sent.code).digest('hex'));map.set(row.codeHash,'<VerifiedResetCodeHash:'+user.email+'>');}}
    for(const r of responses){if(r.body?.accessToken){const token=r.body.accessToken,claims=await jwt.verifyAsync(token);assert.equal(typeof token,'string');const life=claims.exp-claims.iat;delete claims.iat;delete claims.exp;map.set(token,JSON.stringify({claims:JSON.parse(replace(JSON.stringify(claims))),lifetimeSeconds:life}));}}
    for(const r of responses)for(const key of ['token','csrfToken','resetToken','terminalToken'])if(typeof r.body?.[key]==='string'){
      const value=r.body[key],descriptor='<'+key+':'+r.label+'>';map.set(value,descriptor);if(key==='token'||key==='resetToken'||key==='terminalToken')map.set(digest(value),'<Digest:'+key+':'+r.label+'>');
    }
    // Audit keys are random append-only identities, correlated by action/target/outcome/ordinal.
    const ordinals={};for(const row of data.OperationalAuditEvent||[]){const identity=[row.action,replace(row.targetId),row.outcome,replace(row.actorUserId),crypto.createHash('sha256').update(replace(JSON.stringify(stable(row.details)))).digest('hex').slice(0,12)].join(':'),n=ordinals[identity]=(ordinals[identity]||0)+1;map.set(row.id,'<Audit:'+identity+':'+n+'>');map.set(row.eventKey,'<AuditKey:'+identity+':'+n+'>');}
    const redisRows=[];let cursor='0';do{const r=await store.command('SCAN',cursor,'MATCH',store.key('*'),'COUNT',1000);cursor=r[0];for(const key of r[1]){const type=await store.command('TYPE',key);redisRows.push({key:key.replace(process.env.ASTRA_NAMESPACE,'<namespace>'),type,value:type==='string'?await store.command('GET',key):'<'+type+'>',positiveTtl:(await store.command('TTL',key))>0});}}while(cursor!=='0');
    // Correlate opaque recovery hashes even when SQL fails before a credential is returned.
    // Validate the pointer, complete scope, owner and expiry before normalizing only its entropy.
    for(const row of redisRows)if(row.key.includes('recovery-current:')){
      assert.match(row.value,/^[a-f0-9]{64}$/);const terminalId=row.key.split('recovery-current:')[1];
      const linked=redisRows.find(candidate=>candidate.key.endsWith('recovery-credential:'+row.value));assert(linked);
      const scope=JSON.parse(linked.value);assert.equal(scope.terminalId,terminalId);assert.equal(scope.stationId,id('station-A'));
      assert.equal(scope.owner,digest(id('recovery-browser-owner')));assert([id('recovery-ticket'),id('recovery-rollback')].includes(scope.operationId));
      assert(scope.expiresAt>Date.now()&&scope.expiresAt<=Date.now()+900000);assert(linked.positiveTtl&&row.positiveTtl);
      map.set(row.value,'<VerifiedRecoveryCredentialDigest:'+terminalId+'>');
    }
    for(const row of redisRows)if(row.key.includes('recovery-pending:'))map.set(row.value,'<RecoveryTicketHash:'+row.key.split('recovery-pending:')[1]+'>');
    for(const r of responses)if(r.body?.ticket){map.set(r.body.ticket,'<RecoveryTicket:'+r.body.operationId+'>');map.set(digest(r.body.ticket),'<RecoveryTicketHash:'+r.body.terminalId+'>');}
    function canonical(v){if(typeof v==='string'){if(v.startsWith('{')||v.startsWith('[')){try{return JSON.stringify(canonical(JSON.parse(v)));}catch{}}return replace(v);}if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(stable(v)).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v;}
    delete data._prisma_migrations;
    const seq=await sequences(),result={checks:checks.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),responses:responses.map(canonical).sort((a,b)=>a.label.localeCompare(b.label)),snapshot:Object.fromEntries(Object.entries(data).map(([table,rows])=>[table,rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])),sequences:seq,redis:redisRows.map(canonical).sort((a,b)=>a.key.localeCompare(b.key))};
    fs.writeFileSync('/evidence/comparison-data.json',JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync('/evidence/integration-results.json',JSON.stringify({arm,family,checks:checks.length,dispatch,flags,externalHttpAttempts,ocrCalls,migrations:36,financialRows:await db.transaction.count(),receipts:await db.receipt.count(),sequences:seq,uuidMappingEntries:map.size,redisKeys:redisRows.length,realModules:true,comparisonRules:['Seeded IDs literal; generated IDs by table/natural key','Audit random keys by action/target/outcome/actor/ordinal','Lifecycle times excluded; state, financial fields, links and sequences retained','Redis TTL checked positive instead of equal elapsed seconds']},null,2)+'\n');
    console.log(arm+': '+family+' '+checks.length+' HTTP checks and SQL/Redis snapshots verified');
  }finally{if(f)await f.app.close();else if(store)await store.onModuleDestroy();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
