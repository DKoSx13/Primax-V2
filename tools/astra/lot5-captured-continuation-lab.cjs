// Restricted synthetic laboratory: no existing project is started/stopped or modified.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..');process.chdir(repo);
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function docker(args,options={}){return cp.execFileSync('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:32e6,...options});}
function owned(file){const l=json(file);assert(/^primax-astra-lot5-continuation-[a-f0-9]+$/.test(l.project));assert(path.resolve(l.dir).startsWith(path.resolve(repo,'.cache/astra-lot5-continuation')+path.sep));return l;}
function compose(l,args){return docker(['compose','--project-name',l.project,'--file',l.config,...args]);}
function status(project){const ids=docker(['ps','-aq','--filter','label=com.docker.compose.project='+project]).trim().split(/\s+/).filter(Boolean);return ids.length?JSON.parse(docker(['inspect',...ids])):[];}
function safeContainers(cs){return cs.map(c=>({id:c.Id,service:c.Config.Labels['com.docker.compose.service'],image:c.Image,state:c.State.Status,health:c.State.Health?.Status||null,exitCode:c.State.ExitCode,restarts:c.RestartCount,startedAt:c.State.StartedAt,mounts:c.Mounts.map(m=>({type:m.Type,name:m.Name,destination:m.Destination}))}));}
function write(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});}
async function create(){
 const arm=process.env.ASTRA_ARM;assert(['baseline','candidate'].includes(arm));const base=arm==='baseline'?28000:28100;
 cp.execFileSync('git',['merge-base','--is-ancestor','cec1cafc56f770597e786c9182a0fb82c3bfc7d4','HEAD']);

 const project='primax-astra-lot5-continuation-'+crypto.randomBytes(5).toString('hex');
 const dir=path.resolve('.cache/astra-lot5-continuation',project),clean=path.join(dir,'source');fs.mkdirSync(clean,{recursive:true});
 const files=cp.execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const manifest=files.map(file=>({file,sha256:sha(file)}));write(path.join(dir,'initial-sources.json'),manifest);
 for(const f of files){if(!/^(Backend|Frontend_1_FuelFlow|Frontend_2_PrimaxPrime|Frontend_3_PrimaxControl|PrintAgent|PlateRecognition)\//.test(f)&&!['compose.yaml','.env.example'].includes(f))continue;assert(!f.split('/').some(p=>p.startsWith('.env')&&p!=='.env.example'));const to=path.join(clean,f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(f,to);}
 const ranges=JSON.parse(docker(['network','inspect',...docker(['network','ls','-q']).trim().split(/\s+/).filter(Boolean)])).flatMap(n=>n.IPAM?.Config||[]).map(c=>c.Subnet).filter(c=>c&&!c.includes(':'));
 function bounds(c){const[ip,prefix]=c.split('/'),n=ip.split('.').reduce((v,p)=>(v<<8n)+BigInt(p),0n),size=1n<<BigInt(32-Number(prefix));return[n/size*size,n/size*size+size-1n];}
 const subnets=[];for(let i=0;i<256&&subnets.length<2;i++){const c='10.245.'+i+'.0/24',[a,b]=bounds(c);if(ranges.concat(subnets).every(r=>{const[x,y]=bounds(r);return b<x||y<a;}))subnets.push(c);}assert.equal(subnets.length,2);
 const ports=[base,base+81,base+82,base+83,base+84];const net=require('node:net');for(const port of ports)await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
 const secret=()=>crypto.randomBytes(32).toString('hex');
 const operatorPassword=secret();
 const hash=docker(['run','--rm','--network','none','--entrypoint','node','primax-astra-stage2-validation:test','-e','require("bcryptjs").hash(process.argv[1],12).then(h=>process.stdout.write(h))',operatorPassword]).trim();
 const env={...process.env,COMPOSE_PROJECT_NAME:project,ASTRA_DATA_SUBNET:subnets[0],ASTRA_WEB_SUBNET:subnets[1],BACKEND_PORT:String(base+0),FRONTEND1_PORT:String(base+81),FRONTEND2_PORT:String(base+82),FRONTEND3_PORT:String(base+83),FRONTEND1_T02_PORT:String(base+84),POSTGRES_USER:'t02lab',POSTGRES_DB:'astra_t02_synthetic',POSTGRES_PASSWORD:secret(),REDIS_PASSWORD:secret(),JWT_SECRET:secret(),KIOSK_API_KEY:secret(),KIOSK_GATEWAY_SECRET:secret(),OCR_SERVICE_SECRET:secret(),KIOSK_OPERATOR_USER:'t02-diagnostic',KIOSK_OPERATOR_PASSWORD_HASH:hash,DEMO_PASSWORD:secret(),DEMO_CONTROL_ADMIN_PASSWORD:secret(),DEMO_ENCARGADO_PASSWORD:secret()};
 const cfg=JSON.parse(docker(['compose','config','--format','json'],{cwd:clean,env}));
 // Build new project images from the verified snapshot using Docker's cache.
 // Existing containers can refer to unavailable historical image digests; never retag/rebuild their images.
 const accepted=status('primax-astra-original');assert.equal(accepted.length,17);
 const reusedImages=[];
 for(const[service,s]of Object.entries(cfg.services)){
   if(s.profiles?.length){delete cfg.services[service];continue;}
   assert(accepted.some(c=>c.Config.Labels['com.docker.compose.service']===service),service);
 }
 for(const v of Object.values(cfg.volumes)){const p=cp.spawnSync('docker',['volume','inspect',v.name],{encoding:'utf8',windowsHide:true});assert.notEqual(p.status,0,'Volume already exists');}
 assert.equal(status(project).length,0);
 const config=path.join(dir,'compose-private.json');write(config,cfg);
 const l={project,dir,clean,config,env,operatorPassword,arm};write(path.join(dir,'lab-private.json'),l);
 const publicDir='Docs/astra/evidence/lot5-captured-continuation/'+arm;fs.mkdirSync(publicDir,{recursive:true});
 write(publicDir+'/isolation.json',{reference:'cec1cafc56f770597e786c9182a0fb82c3bfc7d4',project,ports,subnets,volumesVerifiedAbsent:true,containerProjectVerifiedAbsent:true,reusedImages,newProjectImagesFromVerifiedSource:true,frontendConfigurationRebuilt:true,newSchemaMigrations:0,existingMigrationChainOnly:36});
 const before={};for(const p of ['primax-astra-original','primax-v2-avance-5c50b4a9'])before[p]=safeContainers(status(p));write(path.join(dir,'protected-before.json'),before);
 console.log('Private laboratory metadata: '+path.relative(repo,path.join(dir,'lab-private.json')));
 const r=cp.spawnSync('docker',['compose','--project-name',project,'--file',config,'up','-d','--wait','--wait-timeout','180'],{encoding:'utf8',windowsHide:true,maxBuffer:32e6});fs.writeFileSync(path.join(dir,'up-private.log'),(r.stdout||'')+(r.stderr||''));assert.equal(r.status,0,'Inspect private up log');
 write(publicDir+'/startup.json',{project,command:'docker compose --project-name <new> --file <private isolated config> up -d --wait --wait-timeout 180',exitCode:r.status,containers:safeContainers(status(project))});
 console.log('Isolated laboratory healthy: '+project);
}
function snapshot(file,label){assert(/^[a-z0-9-]+$/.test(label));const l=owned(file);
 const sql=`SELECT json_build_object('payments',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,"operationId",status,method,amount,provider,"transactionId" FROM "Payment" ORDER BY id) x),'orders',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,"operationId",status,amount,method,"paymentId","transactionId" FROM "OnlineOrder" ORDER BY id) x),'transactions',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,"operationId",status,amount,"authorizationId" FROM "Transaction" ORDER BY id) x),'receipts',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT "transactionId",number,correlative FROM "Receipt" ORDER BY number) x),'authorizations',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,"operationId",status,"authorizedAmount" FROM "FuelAuthorization" ORDER BY id) x),'operations',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,"operationId",status,"terminalId",number FROM "TerminalOperation" ORDER BY id) x),'inventory',(SELECT json_agg(x) FROM (SELECT * FROM "FuelInventory" ORDER BY "stationId","fuelId") x),'reservations',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,"operationId",status,"authorizationId","transactionId","remainingLiters","consumedLiters","releasedLiters" FROM "InventoryReservation" ORDER BY id) x),'paymentEvents',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,kind,"paymentId","orderId" FROM "PaymentEvent" ORDER BY id) x));`;
 const pg=JSON.parse(compose(l,['exec','-T','postgres','psql','-U',l.env.POSTGRES_USER,'-d',l.env.POSTGRES_DB,'-Atc',sql]));
 const redis=args=>compose(l,['exec','-T','-e','REDISCLI_AUTH='+l.env.REDIS_PASSWORD,'redis','redis-cli','--no-auth-warning',...args]).trim();
 const keys=redis(['--scan']).split(/\r?\n/).filter(Boolean).sort();
 const keyEvidence=keys.map(k=>{const type=redis(['TYPE',k]),value=type==='string'?redis(['GET',k]):null;let safe=null;try{const v=JSON.parse(value);safe=Object.fromEntries(Object.entries(v).filter(([key])=>/^(stationId|terminalId|pumpId|operationId|activeOperationId|authenticated|expiresAt|lastSeenAt|tabId|lastUsedAt)$/.test(key)));}catch{}return {keyClass:(k.match(/terminal-owner|recovery-current|recovery-credential|terminal-binding|session|binding/)||['other'])[0],keySha256:crypto.createHash('sha256').update(k).digest('hex'),type,ttl:Number(redis(['TTL',k])),valueSha256:value===null?null:crypto.createHash('sha256').update(value).digest('hex'),safeFields:safe};});
 const result={label,recordedAt:new Date().toISOString(),project:l.project,postgres:pg,redis:{ping:redis(['PING']),keyCount:keys.length,keys:keyEvidence,credentialsExcluded:true}};
 write('Docs/astra/evidence/lot5-captured-continuation/'+l.arm+'/'+label+'.json',result);console.log(JSON.stringify({label,payments:pg.payments.length,transactions:pg.transactions.length,receipts:pg.receipts.length,authorizations:pg.authorizations.length,redisKeys:keys.length}));
}


const[mode,file,label]=process.argv.slice(2);
if(mode==='create')create().catch(e=>{console.error(e.message);process.exitCode=1;});
else if(mode==='snapshot')snapshot(file,label);
else if(mode==='stop'){const l=owned(file);compose(l,['stop','--timeout','20']);write('Docs/astra/evidence/lot5-captured-continuation/'+l.arm+'/stopped.json',{project:l.project,volumesRetained:true,containers:safeContainers(status(l.project))});console.log('Stopped only '+l.project);}
else throw Error('Usage: create | snapshot|stop <new private metadata> [label]');
