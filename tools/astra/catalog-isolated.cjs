// New ephemeral PostgreSQL only. Never reads existing environment/database credentials.
const {execFileSync: exec, spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
const name = 'primax-m4-synthetic-' + Date.now();
const password = require('node:crypto').randomBytes(24).toString('hex');
const key = require('node:crypto').randomBytes(32).toString('hex');
const docker = (...args) => exec('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const delay = ms => new Promise(r=>setTimeout(r,ms));
let child, pool, prisma, gateway, mock;
(async()=>{
 docker('run','-d','--name',name,'--label','primax.test=mission4','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_PASSWORD='+password,'-e','POSTGRES_DB=synthetic','-p','127.0.0.1::5432','postgres:16-alpine');
 for(let i=0;i<60;i++){try{docker('exec',name,'pg_isready','-U','postgres');break;}catch{await delay(500);}}
 await delay(2500);
 const port=docker('port',name,'5432/tcp').trim().split(':').at(-1);
 const url=`postgres://postgres:${password}@127.0.0.1:${port}/synthetic`;
 const {Pool}=require('../../services/catalog/node_modules/pg');pool=new Pool({connectionString:url});
 await pool.query(`CREATE TABLE "Fuel" (id text PRIMARY KEY, code text, name text, "pricePerGallon" numeric, active boolean, "createdAt" timestamptz(3), "updatedAt" timestamptz(3));
 CREATE TABLE "Station" (id text PRIMARY KEY, code text, name text, address text, active boolean, "createdAt" timestamptz(3), "updatedAt" timestamptz(3));
 CREATE TABLE "Benefit" (id text PRIMARY KEY, code text, title text, description text, category text, "pointsCost" integer, active boolean, "createdAt" timestamptz(3), "updatedAt" timestamptz(3));
 CREATE TABLE "FuelInventory" ("stationId" text REFERENCES "Station", "fuelId" text REFERENCES "Fuel", liters numeric, "reservedLiters" numeric, "updatedAt" timestamptz(3), PRIMARY KEY("stationId","fuelId"));
 INSERT INTO "Fuel" VALUES ('f','F','Fuel',21.30,true,now(),now()),('inactive','Z','Old',1,false,now(),now());
 INSERT INTO "Station" VALUES ('a','A','A','Synthetic',true,now(),now()),('b','B','B','Synthetic',true,now(),now());
 INSERT INTO "Benefit" VALUES ('x','X','Benefit','Synthetic','test',10,true,now(),now());
 INSERT INTO "FuelInventory" VALUES ('a','f',100.00,2.00,now()),('b','inactive',50,0,now());
 CREATE ROLE catalog_reader LOGIN PASSWORD '${password}';
 GRANT CONNECT ON DATABASE synthetic TO catalog_reader;
 GRANT USAGE ON SCHEMA public TO catalog_reader;
 GRANT SELECT ON ALL TABLES IN SCHEMA public TO catalog_reader;`);
 const readUrl=url.replace('postgres://postgres:', 'postgres://catalog_reader:');
 const {PrismaClient}=require('../../Backend/node_modules/@prisma/client');prisma=new PrismaClient({datasources:{db:{url}}});
 const old={fuels:()=>prisma.fuel.findMany({where:{active:true},orderBy:{code:'asc'}}),stations:()=>prisma.station.findMany({where:{active:true},orderBy:{code:'asc'}}),benefits:()=>prisma.benefit.findMany({where:{active:true},orderBy:{code:'asc'}}),'fuels/inventory':()=>prisma.fuelInventory.findMany({include:{fuel:true,station:true}})};
 const net=require('node:net');const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const httpPort=server.address().port;await new Promise(r=>server.close(r));
 const origin='http://127.0.0.1:'+httpPort;
 const start=()=>spawn(process.execPath,['dist/main.js'],{cwd:path.join(root,'services/catalog'),env:{PATH:process.env.PATH,APP_ENV:'qa',PORT:String(httpPort),CATALOG_DATABASE_URL:readUrl,CATALOG_API_KEY:key},stdio:'ignore'});
 const ready=async()=>{for(let i=0;i<60;i++){try{if((await fetch(origin+'/health/ready')).ok)return;}catch{}await delay(200);}throw Error('Catalog not ready');};
 child=start();await ready();
 mock=require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'ok'}));});
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mockUrl='http://127.0.0.1:'+mock.address().port;
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const gatewayPort=probe.address().port;await new Promise(r=>probe.close(r));
 const gatewayUrl='http://127.0.0.1:'+gatewayPort;
 gateway=spawn(process.execPath,['Backend/gateway/server.cjs'],{cwd:root,env:{PATH:process.env.PATH,PORT:String(gatewayPort),IDENTITY_URL:mockUrl,COMMERCE_URL:mockUrl,ADMINISTRATION_URL:mockUrl,PRINT_URL:mockUrl,OCR_URL:mockUrl,CATALOG_URL:mockUrl,CATALOG_INTERNAL_HEALTH_URL:origin},stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(gatewayUrl+'/healthz')).ok)break;}catch{}await delay(100);}
 assert.equal((await fetch(gatewayUrl+'/healthz')).status,200);
 const {CatalogReader}=require('../../Backend/dist/src/catalog-reader/catalog-reader');
 const {ConfigService}=require('../../Backend/node_modules/@nestjs/config');
 const facade=new CatalogReader(new ConfigService({CATALOG_READ_ADAPTER:'http',CATALOG_INTERNAL_URL:origin,CATALOG_API_KEY:key}));
 const canonical=x=>JSON.parse(JSON.stringify(x));
 for(const [route,read] of Object.entries(old)){
 const actual=await (await fetch(origin+'/api/v1/'+route,{headers:{'x-catalog-key':key}})).json();
 const expected=canonical(await read());
 const sort=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 assert.deepEqual(sort(actual),sort(expected));assert.deepEqual(sort(await facade.read(route)),sort(expected));console.log('PARITY unscoped',route);
 }
 for(const route of ['stations','fuels/inventory'])assert.equal((await (await fetch(origin+'/api/v1/'+route+'?stationId=a',{headers:{'x-catalog-key':key}})).json()).length,1);
 const ro=new Pool({connectionString:readUrl});try{await assert.rejects(ro.query('DELETE FROM "FuelInventory"'), /permission denied/);}finally{await ro.end();}
 await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');});
 await assert.rejects(fetch(origin+'/health'));
 await assert.rejects(facade.read('stations'), /Catalog unavailable/);
 assert.equal((await fetch(gatewayUrl+'/healthz')).status,503);
 for(const route of ['auth/test','transactions/test','control/test']) assert.equal((await fetch(gatewayUrl+'/api/v1/'+route)).status,200);
 console.log('PASS Gateway degraded; Identity/Commerce/Administration routes remain available (synthetic upstreams)');
 assert.equal(Number((await pool.query('SELECT count(*) FROM "FuelInventory"')).rows[0].count),2);
 child=start();await ready();assert.equal((await fetch(gatewayUrl+'/healthz')).status,200);console.log('PASS real PostgreSQL, read-only role, parity, scoped/unscoped, stop/restart');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{if(gateway)await new Promise(r=>{gateway.once('exit',r);gateway.kill('SIGTERM');});if(mock)await new Promise(r=>mock.close(r));if(child&&!child.killed&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');});if(prisma)await prisma.$disconnect();if(pool)await pool.end();try{docker('stop',name);}catch{}console.log('Synthetic container stopped; no existing resources touched:',name);});
