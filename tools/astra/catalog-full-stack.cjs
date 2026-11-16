// Synthetic full-stack acceptance. No inherited environment or existing volumes.
const {execFileSync:exec,spawn}=require('node:child_process');
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
// Docker lifecycle commands block this harness; do not reuse its idle HTTP sockets.
const nativeFetch=globalThis.fetch;
const fetch=(url,options={})=>nativeFetch(url,{...options,headers:{...options.headers,connection:'close'}});
const root=path.resolve(__dirname,'../..'),name='primax-m4-full-'+Date.now();
const secret=crypto.randomBytes(32).toString('hex'),key=crypto.randomBytes(32).toString('hex');
const docker=(...a)=>exec('docker',a,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const delay=ms=>new Promise(r=>setTimeout(r,ms));const children=[];let db,redis;
const fs=require('node:fs');let composeFile,composeProject;
if(fs.existsSync(path.join(root,'.env'))) throw Error('Synthetic lab refuses root .env; use an isolated checkout');
const report=[];function pass(s){report.push(s);console.log('PASS',s);}
async function port(){const s=require('node:net').createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function start(file,env){const c=spawn(process.execPath,[file],{cwd:root,env:{PATH:process.env.PATH,...env},stdio:['ignore','pipe','pipe']});c.logs='';for(const stream of [c.stdout,c.stderr])stream.on('data',d=>{c.logs=(c.logs+d).slice(-2000);});children.push(c);return c;}
async function stop(c){if(c.exitCode!==null||c.killed)return;await new Promise(r=>{c.once('exit',r);c.kill('SIGTERM');});}
async function ready(url,c){for(let i=0;i<150;i++){if(c.exitCode!==null)throw Error('Process exited: '+c.logs.replaceAll(secret,'[secret]').replaceAll(key,'[key]'));try{if((await fetch(url,{signal:AbortSignal.timeout(3000)})).ok)return;}catch{}await delay(200);}throw Error('Startup timeout '+url);}
async function request(origin,route,headers={}){const r=await fetch(origin+'/api/v1/'+route,{headers});return {status:r.status,body:await r.json()};}
(async()=>{
 docker('run','-d','--name',name,'--label','primax.test=mission4-full','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_PASSWORD='+secret,'-e','POSTGRES_DB=synthetic','-p','127.0.0.1::5432','postgres:16-alpine');
 docker('run','-d','--name',name+'-redis','--label','primax.test=mission4-full','-p','127.0.0.1::6379','redis:7-alpine','redis-server','--save','','--appendonly','no','--requirepass',secret);
 const pgport=docker('port',name,'5432/tcp').trim().split(':').at(-1),rp=docker('port',name+'-redis','6379/tcp').trim().split(':').at(-1);
 const url=`postgres://postgres:${secret}@127.0.0.1:${pgport}/synthetic`;
 const {PrismaClient}=require('../../Backend/node_modules/@prisma/client');
 for(let i=0;i<90;i++){try{docker('exec',name,'pg_isready','-U','postgres');break;}catch{}await delay(300);}await delay(2500);
 exec(path.join(root,'Backend/node_modules/.bin/prisma'),['migrate','deploy'],{cwd:path.join(root,'Backend'),env:{PATH:process.env.PATH,DATABASE_URL:url,DATABASE_URL_UNPOOLED:url},stdio:'pipe'});
 db=new PrismaClient({datasources:{db:{url}}});
 const a=await db.station.create({data:{code:'A',name:'Synthetic A',address:'Test'}}),b=await db.station.create({data:{code:'B',name:'Synthetic B',address:'Test'}});
 const f=await db.fuel.create({data:{code:'F',name:'Fuel',pricePerGallon:'21.30'}});
 await db.fuelInventory.createMany({data:[{stationId:a.id,fuelId:f.id,liters:100},{stationId:b.id,fuelId:f.id,liters:200}]});
 await db.benefit.create({data:{code:'X',title:'Synthetic',description:'Test',category:'test',pointsCost:10}});
 const passwordHash=await require('../../Backend/node_modules/bcryptjs').hash('Synthetic-password-42',12);
 const user=await db.user.create({data:{email:'synthetic@example.invalid',name:'Synthetic',passwordHash}});
 await db.membership.create({data:{userId:user.id,number:'SYNTHETIC-001'}});
 await db.$executeRawUnsafe(`CREATE ROLE catalog_reader LOGIN PASSWORD '${secret}'`);
 await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO catalog_reader');
 await db.$executeRawUnsafe('GRANT SELECT ON "Fuel", "Station", "Benefit", "FuelInventory" TO catalog_reader');
 const readUrl=url.replace('postgres://postgres:','postgres://catalog_reader:');
 const cp=await port(),catalogOrigin='http://127.0.0.1:'+cp;
 const catalogEnv={CATALOG_BIND_HOST:'127.0.0.1',APP_ENV:'qa',PORT:String(cp),CATALOG_DATABASE_URL:readUrl,CATALOG_API_KEY:key};
 let catalog=start('services/catalog/dist/main.js',catalogEnv);await ready(catalogOrigin+'/health/ready',catalog);
 if(process.argv.includes('--compose')) {
 composeProject=name;composeFile=path.join(require('node:os').tmpdir(),name+'.compose.json');
 const conf={services:{catalog:{build:path.join(root,'services/catalog'),environment:{APP_ENV:'qa',CATALOG_DATABASE_URL:`postgres://catalog_reader:${secret}@${name}:5432/synthetic`,CATALOG_API_KEY:key},networks:['private']},print:{build:path.join(root,'PrintAgent'),tmpfs:['/data:uid=1000,gid=1000'],networks:['private']},ocr:{build:path.join(root,'PlateRecognition'),environment:{OCR_SERVICE_SECRET:secret},networks:['private']}},networks:{private:{internal:true}}};
 fs.writeFileSync(composeFile,JSON.stringify(conf),{mode:0o600});
 docker('compose','-p',composeProject,'-f',composeFile,'build');
 // Compose owns its private network; start first, then attach only our fresh PostgreSQL.
 docker('compose','-p',composeProject,'-f',composeFile,'up','-d');
 docker('network','connect',composeProject+'_private',name);
 const originFor=service=>{const id=docker('compose','-p',composeProject,'-f',composeFile,'ps','-q',service).trim();return 'http://'+JSON.parse(docker('inspect',id))[0].NetworkSettings.Networks[composeProject+'_private'].IPAddress;};
 globalThis.privateCatalog=originFor('catalog')+':3000';globalThis.printOrigin=originFor('print')+':3000';globalThis.ocrOrigin=originFor('ocr')+':8000';
 for(const [origin,healthPath] of [[globalThis.privateCatalog,'/health/ready'],[globalThis.printOrigin,'/api/v1/health'],[globalThis.ocrOrigin,'/health']])await ready(origin+healthPath,{exitCode:null});
 const catalogId=docker('compose','-p',composeProject,'-f',composeFile,'ps','-q','catalog').trim();assert.deepEqual(JSON.parse(docker('inspect',catalogId))[0].HostConfig.PortBindings,{});
 pass('Compose private Catalog without published ports; real Print/OCR ready');
 }
 const base={BIND_HOST:'127.0.0.1',DATABASE_URL:url,DATABASE_URL_UNPOOLED:url,JWT_SECRET:secret,KIOSK_API_KEY:secret,APP_MODE:'local',KIOSK_STATION_ID:a.id,KIOSK_GATEWAY_SECRET:secret,KIOSK_REDIS_URL:'redis://:'+secret+'@127.0.0.1:'+rp+'/0',KIOSK_SESSION_NAMESPACE:name,PASSWORD_RESET_DELIVERY:'disabled'};
 const origins={};
 for(const domain of ['identity','commerce','administration','catalog']){const p=await port();const c=start(`Backend/dist/src/apps/${domain}/main.js`,{...base,PORT:String(p)});origins[domain]='http://127.0.0.1:'+p;await ready(origins[domain]+'/api/v1/health',c);}
 const fp=await port(),facadeOrigin='http://127.0.0.1:'+fp;
 const facade=start('Backend/dist/src/apps/catalog/main.js',{...base,PORT:String(fp),CATALOG_READ_ADAPTER:'http',CATALOG_INTERNAL_URL:globalThis.privateCatalog||catalogOrigin,CATALOG_API_KEY:key});await ready(facadeOrigin+'/api/v1/health',facade);
 const gp=await port(),gatewayOrigin='http://127.0.0.1:'+gp;
 const gateway=start('Backend/gateway/server.cjs',{BIND_HOST:'127.0.0.1',PORT:String(gp),IDENTITY_URL:origins.identity,COMMERCE_URL:origins.commerce,ADMINISTRATION_URL:origins.administration,CATALOG_URL:facadeOrigin,CATALOG_INTERNAL_HEALTH_URL:globalThis.privateCatalog||catalogOrigin,PRINT_URL:globalThis.printOrigin||origins.identity,OCR_URL:globalThis.ocrOrigin||origins.identity});
 // Optional print/OCR processes are outside this lab; inspect named domains individually.
 await ready(gatewayOrigin+'/api/v1/fuels',gateway);pass('real independent domain processes and Gateway started');
 for(const route of ['fuels','stations','benefits','fuels/inventory']){
 const old=await request(origins.catalog,route),current=await request(gatewayOrigin,route);
 if(route==='fuels/inventory'){for(const response of [old,current])response.body.sort((a,b)=>(a.stationId+a.fuelId).localeCompare(b.stationId+b.fuelId));}
 assert.deepEqual(current,old);pass('HTTP parity unscoped '+route);
 }
 const login=await fetch(gatewayOrigin+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password:'Synthetic-password-42'})});
 assert.equal(login.status,200);const loginBody=await login.json();assert.ok(loginBody.accessToken);pass('real Identity login with synthetic password');
 const contracts=require('../../Docs/astra/catalog-data-contracts.json');
 for(const [route,fields] of Object.entries(contracts.public)){
 const result=await request(gatewayOrigin,route);assert.equal(result.status,200);
 for(const row of result.body)assert.deepEqual(Object.keys(row).sort(),[...fields].sort());
 }
 const legacyInventory=await fetch(gatewayOrigin+'/api/v1/fuels/inventory');
 assert.equal(legacyInventory.headers.get('cache-control'),'no-store');
 for(const row of await legacyInventory.json()){
 assert.deepEqual(Object.keys(row).sort(),[...contracts.inventory.fields].sort());
 for(const [field,type] of Object.entries(contracts.inventory.nestedPublicTypes))assert.deepEqual(Object.keys(row[field]).sort(),[...contracts.public[type]].sort());
 assert.ok('liters' in row && 'reservedLiters' in row); // Explicitly track temporary sensitive exposure.
 }
 pass('approved field contracts and explicit legacy inventory exposure; no-store');
 const token=require('../../Backend/node_modules/@nestjs/jwt');const jwt=new token.JwtService({secret,signOptions:{issuer:'primax-v6',audience:'primax-prime'}});
 const valid=jwt.sign({sub:user.id,ver:0}),expired=jwt.sign({sub:user.id,ver:0},{expiresIn:-1});
 assert.equal((await request(gatewayOrigin,'memberships/me',{authorization:'Bearer '+valid})).status,200);
 for(const t of [expired,valid+'x'])assert.equal((await request(gatewayOrigin,'memberships/me',{authorization:'Bearer '+t})).status,401);
 await db.user.update({where:{id:user.id},data:{authVersion:1}});
 assert.equal((await request(gatewayOrigin,'memberships/me',{authorization:'Bearer '+valid})).status,401);pass('AuthCore valid, invalid, expired and version-revoked JWT');
 const fresh=jwt.sign({sub:user.id,ver:1});assert.equal((await request(gatewayOrigin,'control/session',{authorization:'Bearer '+fresh})).status,403);pass('member denied Control role');
 const account=await db.adminControlAccount.create({data:{userId:user.id,role:'ENCARGADO',status:'APPROVED',emailVerifiedAt:new Date()}});
 await db.adminControlGrant.create({data:{userId:user.id,permission:'ADMIN_CONTROL_ACCESS',reason:'Synthetic'}});
 await db.adminStationAssignment.create({data:{userId:user.id,accountId:account.id,stationId:a.id,reason:'Synthetic'}});
 const control=await request(gatewayOrigin,'control/session',{authorization:'Bearer '+fresh});assert.equal(control.status,200);pass('approved Control account with station assignment');
 for(const route of ['control/catalog/stations','control/catalog/inventory']){
 assert.equal((await request(gatewayOrigin,route)).status,401);
 assert.equal((await request(gatewayOrigin,route,{authorization:'Bearer '+expired})).status,401);
 assert.equal((await request(gatewayOrigin,route,{authorization:'Bearer '+fresh})).status,403);
 }
 await db.adminControlGrant.create({data:{userId:user.id,permission:'ADMIN_INVENTORY_VIEW',reason:'Synthetic'}});
 for(const route of ['control/catalog/stations','control/catalog/inventory']){
 const headers={authorization:'Bearer '+fresh};const rows=await request(gatewayOrigin,route,headers);assert.equal(rows.status,200);assert.equal(rows.body.length,1);assert.equal(rows.body[0][route.endsWith('stations')?'id':'stationId'],a.id);
 assert.equal((await request(gatewayOrigin,route+'?stationId='+b.id,headers)).status,403);
 assert.equal((await request(gatewayOrigin,route+'?stationId='+a.id,headers)).status,200);
 assert.equal((await request(gatewayOrigin,route+'?stationId=invalid',headers)).status,400);
 }
 assert.equal((await fetch(gatewayOrigin+'/api/v1/control/catalog/inventory',{headers:{authorization:'Bearer '+fresh}})).headers.get('cache-control'),'no-store');
 pass('private Control catalog: anonymous/expired/missing permission denied; station filtering and tampering');
 await db.adminControlAccount.update({where:{id:account.id},data:{role:'ADMIN'}});
 assert.equal((await request(gatewayOrigin,'control/catalog/stations',{authorization:'Bearer '+fresh})).status,200);
 await db.adminStationAssignment.updateMany({where:{accountId:account.id},data:{endedAt:new Date()}});
 assert.equal((await request(gatewayOrigin,'control/catalog/stations',{authorization:'Bearer '+fresh})).status,403);
 await db.adminStationAssignment.updateMany({where:{accountId:account.id},data:{endedAt:null}});
 pass('ADMIN and ENCARGADO grants; empty station scope rejected');
 await db.adminControlGrant.updateMany({where:{userId:user.id},data:{revokedAt:new Date()}});
 assert.equal((await request(gatewayOrigin,'control/session',{authorization:'Bearer '+fresh})).status,403);pass('revoked Control permission denied');
 await db.userPermissionGrant.create({data:{userId:user.id,permission:'SYSTEM_ADMIN',reason:'Synthetic'}});
 assert.equal((await request(gatewayOrigin,'control/catalog/stations',{authorization:'Bearer '+fresh})).body.length,2);
 await db.userPermissionGrant.updateMany({where:{userId:user.id},data:{revokedAt:new Date()}});
 assert.equal((await request(gatewayOrigin,'control/catalog/stations',{authorization:'Bearer '+fresh})).status,403);pass('SYSTEM_ADMIN global station visibility and grant revocation');
 redis=require('../../Backend/node_modules/redis').createClient({url:base.KIOSK_REDIS_URL});await redis.connect();
 const session=crypto.randomBytes(32).toString('base64url'),csrf='synthetic-csrf';
 const version=crypto.createHmac('sha256',secret).update(JSON.stringify([undefined,undefined,a.id,'1'])).digest('hex');
 const sessionKey=`primax:v12:${name}:session:${crypto.createHash('sha256').update(session).digest('hex')}`;
 await redis.set(sessionKey,JSON.stringify({authenticated:true,csrf,version,stationId:a.id,expiresAt:Date.now()+60000}));
 function signed(route,invalid=false,technical=''){const time=String(Date.now()),p='/api/v1/'+route;return {'x-kiosk-time':time,'x-kiosk-session':session,'x-csrf-token':csrf,'x-terminal-session':technical,'x-kiosk-signature':invalid?'0'.repeat(64):crypto.createHmac('sha256',secret).update(JSON.stringify(['GET',p,time,null,session,csrf,technical,'',''])).digest('hex')};}
 for(const route of ['stations','fuels/inventory']){
 const result=await request(gatewayOrigin,route,signed(route));assert.equal(result.status,200);assert.equal(result.body.length,1);assert.equal(result.body[0][route==='stations'?'id':'stationId'],a.id);
 assert.deepEqual(result,await request(origins.catalog,route,signed(route)));
 assert.equal((await request(gatewayOrigin,route,signed(route,true))).status,401);
 const manipulated=route+'?stationId='+b.id;assert.equal((await request(gatewayOrigin,manipulated,signed(manipulated))).status,403);
 assert.equal((await request(gatewayOrigin,'control/catalog/inventory',signed('control/catalog/inventory'))).status,403);
 }pass('valid/invalid kiosk signatures; station scope; manipulated query denied; legacy parity');
 const terminal=await db.terminal.create({data:{stationId:a.id,code:'SYNTHETIC-T01'}});
 const technical=crypto.randomBytes(32).toString('hex');
 const credential=await db.terminalCredential.create({data:{terminalId:terminal.id,tokenHash:crypto.createHash('sha256').update(technical).digest('hex'),expiresAt:new Date(Date.now()+60000)}});
 for(const state of ['valid','expired','revoked']){
 if(state==='expired')await db.terminalCredential.update({where:{id:credential.id},data:{issuedAt:new Date(Date.now()-120000),expiresAt:new Date(Date.now()-60000)}});
 if(state==='revoked')await db.terminalCredential.update({where:{id:credential.id},data:{revokedAt:new Date()}});
 assert.equal((await request(gatewayOrigin,'control/catalog/inventory',signed('control/catalog/inventory',false,technical))).status,403);
 }
 pass('technical terminal credentials never grant Control catalog access');
 await redis.del(sessionKey);assert.equal((await request(gatewayOrigin,'stations',signed('stations'))).status,401);pass('revoked kiosk session denied');
 // Public contract explicitly permits all stations, including when an invalid Bearer is supplied.
 assert.equal((await request(gatewayOrigin,'stations',{authorization:'Bearer '+expired})).body.length,2);pass('documented public contract reproduced: Bearer does not scope Public routes');
 assert.equal((await request(catalogOrigin,'stations')).status,401);
 const {Pool}=require('../../services/catalog/node_modules/pg');const ro=new Pool({connectionString:readUrl});try{await assert.rejects(ro.query('DELETE FROM "FuelInventory"'),/permission denied/);}finally{await ro.end();}pass('internal key required; PostgreSQL role rejects writes');
 const health=async()=>{const r=await fetch(gatewayOrigin+'/healthz');return r.json();};
 assert.equal((await health()).services.catalogRead,'up');
 if(composeFile){assert.equal((await fetch(gatewayOrigin+'/healthz')).status,200);docker('compose','-p',composeProject,'-f',composeFile,'stop','catalog');}else await stop(catalog);
 assert.equal((await request(gatewayOrigin,'stations')).status,503);assert.equal((await health()).services.catalogRead,'down');
 for(const domain of ['identity','commerce','administration','catalog'])assert.equal((await health()).services[domain],'up');
 for(const domain of ['identity','commerce','administration'])assert.equal((await fetch(origins[domain]+'/api/v1/health')).status,200);
 assert.equal((await request(gatewayOrigin,'control/session',{authorization:'Bearer '+fresh})).status,403);
 assert.equal((await request(gatewayOrigin,'memberships/me',{authorization:'Bearer '+fresh})).status,200);
 assert.equal((await request(gatewayOrigin,'memberships/me/wallet',{authorization:'Bearer '+fresh})).status,200);pass('Catalog down: real domain health and Identity auth remain available');
 if(composeFile){docker('compose','-p',composeProject,'-f',composeFile,'start','catalog');await ready(globalThis.privateCatalog+'/health/ready',{exitCode:null});}else{catalog=start('services/catalog/dist/main.js',catalogEnv);await ready(catalogOrigin+'/health/ready',catalog);}assert.equal((await health()).services.catalogRead,'up');assert.equal((await request(gatewayOrigin,'stations')).status,200);pass('Catalog restart restores readiness and facade');
})().catch(e=>{console.error('FAIL', ((e.stack || e.message) + ' cause=' + (e.cause?.code || '')).replaceAll(secret,'[secret]').replaceAll(key,'[key]'));
 for(const c of children)if(c.exitCode!==null)console.error('child exit',c.spawnargs[1],c.exitCode);process.exitCode=1;}).finally(async()=>{for(const c of children.reverse())await stop(c);if(composeFile){try{docker('compose','-p',composeProject,'-f',composeFile,'stop');}catch{}fs.writeFileSync(composeFile,'{}',{mode:0o600});}if(redis?.isOpen)await redis.quit();if(db)await db.$disconnect();for(const n of [name,name+'-redis'])try{docker('stop',n);}catch{}console.log(JSON.stringify({syntheticLab:name,passed:report.length,checks:report}));});
