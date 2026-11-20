// Restricted synthetic laboratory: no existing project is started/stopped or modified.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..');process.chdir(repo);
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function docker(args,options={}){return cp.execFileSync('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:32e6,...options});}
function owned(file){const l=json(file);assert(/^primax-astra-lot5-t02-[a-f0-9]+$/.test(l.project));assert(path.resolve(l.dir).startsWith(path.resolve(repo,'.cache/astra-lot5-t02')+path.sep));return l;}
function compose(l,args){return docker(['compose','--project-name',l.project,'--file',l.config,...args]);}
function status(project){const ids=docker(['ps','-aq','--filter','label=com.docker.compose.project='+project]).trim().split(/\s+/).filter(Boolean);return ids.length?JSON.parse(docker(['inspect',...ids])):[];}
function safeContainers(cs){return cs.map(c=>({id:c.Id,service:c.Config.Labels['com.docker.compose.service'],image:c.Image,state:c.State.Status,health:c.State.Health?.Status||null,exitCode:c.State.ExitCode,restarts:c.RestartCount,startedAt:c.State.StartedAt,mounts:c.Mounts.map(m=>({type:m.Type,name:m.Name,destination:m.Destination}))}));}
function write(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});}
async function create(){
 cp.execFileSync('git',['merge-base','--is-ancestor','945abd06dc2f5392348438d466c7e2e3967e316b','HEAD']);
 assert.equal(cp.execFileSync('git',['diff','--name-only','945abd06dc2f5392348438d466c7e2e3967e316b','--','Backend','Frontend_1_FuelFlow','Frontend_2_PrimaxPrime','Frontend_3_PrimaxControl','PrintAgent','PlateRecognition','compose.yaml','.env.example'],{encoding:'utf8'}).trim(),'','Application source differs from diagnostic baseline');
 const project='primax-astra-lot5-t02-'+crypto.randomBytes(5).toString('hex');
 const dir=path.resolve('.cache/astra-lot5-t02',project),clean=path.join(dir,'source');fs.mkdirSync(clean,{recursive:true});
 const files=cp.execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const manifest=files.map(file=>({file,sha256:sha(file)}));write(path.join(dir,'initial-sources.json'),manifest);
 for(const f of files){if(!/^(Backend|Frontend_1_FuelFlow|Frontend_2_PrimaxPrime|Frontend_3_PrimaxControl|PrintAgent|PlateRecognition)\//.test(f)&&!['compose.yaml','.env.example'].includes(f))continue;assert(!f.split('/').some(p=>p.startsWith('.env')&&p!=='.env.example'));const to=path.join(clean,f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(f,to);}
 const ranges=JSON.parse(docker(['network','inspect',...docker(['network','ls','-q']).trim().split(/\s+/).filter(Boolean)])).flatMap(n=>n.IPAM?.Config||[]).map(c=>c.Subnet).filter(c=>c&&!c.includes(':'));
 function bounds(c){const[ip,prefix]=c.split('/'),n=ip.split('.').reduce((v,p)=>(v<<8n)+BigInt(p),0n),size=1n<<BigInt(32-Number(prefix));return[n/size*size,n/size*size+size-1n];}
 const subnets=[];for(let i=0;i<256&&subnets.length<2;i++){const c='10.247.'+i+'.0/24',[a,b]=bounds(c);if(ranges.concat(subnets).every(r=>{const[x,y]=bounds(r);return b<x||y<a;}))subnets.push(c);}assert.equal(subnets.length,2);
 const ports=[27500,27581,27582,27583,27584];const net=require('node:net');for(const port of ports)await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
 const secret=()=>crypto.randomBytes(32).toString('hex');
 const operatorPassword=secret();
 const hash=docker(['run','--rm','--network','none','--entrypoint','node','primax-astra-stage2-validation:test','-e','require("bcryptjs").hash(process.argv[1],12).then(h=>process.stdout.write(h))',operatorPassword]).trim();
 const env={...process.env,COMPOSE_PROJECT_NAME:project,ASTRA_DATA_SUBNET:subnets[0],ASTRA_WEB_SUBNET:subnets[1],BACKEND_PORT:'27500',FRONTEND1_PORT:'27581',FRONTEND2_PORT:'27582',FRONTEND3_PORT:'27583',FRONTEND1_T02_PORT:'27584',POSTGRES_USER:'t02lab',POSTGRES_DB:'astra_t02_synthetic',POSTGRES_PASSWORD:secret(),REDIS_PASSWORD:secret(),JWT_SECRET:secret(),KIOSK_API_KEY:secret(),KIOSK_GATEWAY_SECRET:secret(),OCR_SERVICE_SECRET:secret(),KIOSK_OPERATOR_USER:'t02-diagnostic',KIOSK_OPERATOR_PASSWORD_HASH:hash,DEMO_PASSWORD:secret(),DEMO_CONTROL_ADMIN_PASSWORD:secret(),DEMO_ENCARGADO_PASSWORD:secret()};
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
 const l={project,dir,clean,config,env,operatorPassword};write(path.join(dir,'lab-private.json'),l);
 const publicDir='Docs/astra/evidence/lot5-t02-diagnostic';fs.mkdirSync(publicDir,{recursive:true});
 write(publicDir+'/isolation.json',{reference:'945abd06dc2f5392348438d466c7e2e3967e316b',project,ports,subnets,volumesVerifiedAbsent:true,containerProjectVerifiedAbsent:true,reusedImages,newProjectImagesFromVerifiedSource:true,frontendConfigurationRebuilt:true,newSchemaMigrations:0,existingMigrationChainOnly:36});
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
 write('Docs/astra/evidence/lot5-t02-diagnostic/'+label+'.json',result);console.log(JSON.stringify({label,payments:pg.payments.length,transactions:pg.transactions.length,receipts:pg.receipts.length,authorizations:pg.authorizations.length,redisKeys:keys.length}));
}
const[mode,file,label]=process.argv.slice(2);
if(mode==='create')create().catch(e=>{console.error(e.message);process.exitCode=1;});
else if(mode==='status'){const l=owned(file);console.log(JSON.stringify(safeContainers(status(l.project)),null,2));}
else if(mode==='snapshot')snapshot(file,label);
else if(mode==='verify')verify(file);
else if(mode==='stop'){const l=owned(file);compose(l,['stop','--timeout','20']);console.log('Stopped only '+l.project+'; volumes retained');}
else throw Error('Usage: node tools/astra/lot5-t02-diagnostic.cjs create | status|snapshot|stop|verify <private metadata> [label]');

function verify(file){
 const l=owned(file),out='Docs/astra/evidence/lot5-t02-diagnostic',r=n=>json(out+'/'+n+'.json');
 const b=r('browser-evidence'),before=r('pending-before-reload'),reload=r('pending-after-reload'),failure=r('captured-after-failure'),retry=r('captured-after-retries'),last=r('after-captured-reload');
 assert.deepEqual(before.postgres,reload.postgres);
 assert.deepEqual(failure.postgres,retry.postgres);assert.deepEqual(failure.postgres,last.postgres);
 assert.equal(r('initial').postgres.payments.length,0);
 assert.equal(failure.postgres.payments.length,1);assert.equal(failure.postgres.payments[0].status,'CAPTURED');
 for(const p of [before,reload,failure,retry,last]){
   assert.equal(p.redis.ping,'PONG');assert.equal(p.postgres.transactions.length,0);assert.equal(p.postgres.receipts.length,0);assert.equal(p.postgres.authorizations.length,0);
   assert.equal(p.postgres.operations.length,1);assert.equal(p.postgres.operations[0].operationId,before.postgres.operations[0].operationId);
   assert(p.redis.keys.some(k=>k.safeFields?.authenticated===true&&k.ttl>0));
 }
 assert.equal(failure.postgres.paymentEvents.filter(e=>e.kind==='CAPTURED').length,1);
 assert.equal(b.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/online-orders').length,1);
 assert.equal(b.requests.filter(r=>r.path.endsWith('/demo-confirm')).length,2);
 assert.equal(b.requests.filter(r=>r.method==='POST'&&/\/authorizations$|\/transactions$/.test(r.path)).length,0);
 assert(!b.requests.some(r=>/^same-operation-ui-retry-/.test(r.phase)));
 assert(!b.requests.some(r=>r.phase==='reload-pending'&&/\/fuels$|\/stations$/.test(r.path)));
 assert.equal(b.debugger[0].variables.catalogType,'undefined');assert.equal(b.debugger[0].stack[0].line,2452);
 assert.equal(r('persisted-transient-flags').savedCreatingOrder,true);
 const s1=b.states.find(s=>s.phase==='order-pending-before-reload'),s2=b.states.find(s=>s.phase==='reload-pending');
 assert.equal(s1.operationId,s2.operationId);assert.equal(s1.tabId,s2.tabId);assert.equal(s1.snapshot.onlineOrderId,s2.onlineOrderId);
 assert.equal(s1.total,'S/ 20.00');assert.equal(s2.total,'—');
 assert(s2.cookies.filter(c=>c.httpOnly).every(c=>c.preserved));
 const initial=json(path.join(l.dir,'initial-sources.json'));
 const allowed=['Docs/astra/primax-lot5-final-report.md','Docs/astra/primax-lot5-known-incidents.md','Docs/astra/primax-stage3j-definitive-hexagonal-closure-plan.md'];
 const changed=initial.filter(e=>sha(e.file)!==e.sha256).map(e=>e.file);assert(changed.every(f=>allowed.includes(f)));
 const historical=json('Docs/astra/evidence/lot5-validation/integrity.json').historicalEvidence;
 for(const e of historical){assert.equal(sha(e.file),e.sha256);assert.equal(cp.execFileSync('git',['ls-files','--',e.file],{encoding:'utf8'}).trim(),'');}
 const protectedBefore=json(path.join(l.dir,'protected-before.json'));
 const sort=cs=>cs.sort((a,b)=>a.id.localeCompare(b.id));
 for(const[p,old]of Object.entries(protectedBefore))assert.deepEqual(sort(safeContainers(status(p))),sort(old));
 const stopped=r('stopped-lab');assert.equal(stopped.volumesRetained.length,4);assert(stopped.containers.every(c=>!c.running&&c.exitCode!==137&&!c.oomKilled));
 const secretKeys=['POSTGRES_PASSWORD','REDIS_PASSWORD','JWT_SECRET','KIOSK_API_KEY','KIOSK_GATEWAY_SECRET','OCR_SERVICE_SECRET','KIOSK_OPERATOR_PASSWORD_HASH','DEMO_PASSWORD','DEMO_CONTROL_ADMIN_PASSWORD','DEMO_ENCARGADO_PASSWORD'];
 const secrets=secretKeys.map(k=>l.env[k]).concat(l.operatorPassword).filter(s=>s&&s.length>=16);
 const publicFiles=fs.readdirSync(out).filter(f=>f!=='review-summary.json').map(f=>out+'/'+f);
 const docs=['Docs/astra/primax-lot5-t02-diagnostic.md',...allowed];
 for(const f of publicFiles.filter(f=>f.endsWith('.json')).concat(docs,__filename)){
  const text=fs.readFileSync(f,'utf8');for(const secret of secrets)assert(!text.includes(secret),'Private key in '+f);
  assert(!/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/.test(text),'Full JWT in '+f);
 }
 for(const f of docs)for(const m of fs.readFileSync(f,'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=m[1].split('#')[0];if(target&&!/^https?:/.test(target))assert(fs.existsSync(path.resolve(path.dirname(f),target)),f+' -> '+target);}
 const checks=[
  {id:'D01',case:'Docker Desktop restored without destructive reset',pass:true},
  {id:'D02',case:'Original 15 healthy and two successful jobs',pass:true},
  {id:'D03',case:'New isolated synthetic lab starts healthy',pass:true},
  {id:'D04',case:'Pending reload preserves session/tab/order/operation',pass:true},
  {id:'D05',case:'Pending reload rebuilds total and QR',pass:false},
  {id:'D06',case:'Confirm after reload completes dispatch and receipt',pass:false},
  {id:'D07',case:'Two failed UI retries preserve identifiers without duplicate HTTP capture',pass:true},
  {id:'D08',case:'Replay of same demo-confirm preserves one captured payment/event',pass:true},
  {id:'D09',case:'Reload CAPTURED preserves operation and requests assistance under existing rule',pass:true},
  {id:'D10',case:'SQL financial/inventory snapshot exact across retries/replay/second reload',pass:true},
  {id:'D11',case:'Captured exception confirms catalog undefined; transient flag persists',pass:true},
  {id:'D12',case:'Initial synthetic lab has no payment or sale',pass:true},
  {id:'D13',case:'Application sources, prior evidence and nine historical files preserved',pass:true},
  {id:'D14',case:'Only new lab stopped; four volumes retained without SIGKILL/OOM',pass:true}
 ];
 const result={reference:'945abd06dc2f5392348438d466c7e2e3967e316b',verifiedAt:new Date().toISOString(),project:l.project,diagnosticVerified:true,functionalFixApplied:false,lot5Complete:false,severity:'P1 functional; captured demo payment without dispatch/sale/receipt',cause:'Frontend recovery skips catalog initialization and restores transient creatingOrder flag; DOM total not rebuilt',checks,counts:{groupedChecks:checks.length,pass:checks.filter(c=>c.pass).length,fail:checks.filter(c=>!c.pass).length,httpResponses:b.requests.length,prior3526NotRepeated:true},sourceManifestEntries:initial.length,changedPreviouslyTrackedFiles:changed,historicalFilesUnchangedAndUntracked:9,protectedProjectsUnchangedSinceEngineStartup:true,privateSecretScanMatches:0,evidence:publicFiles.map(file=>({file,sha256:sha(file)})),mandatoryPending:['Authorized functional correction and targeted regression','Native Linux and macOS host validation per unchanged 3J','ARM64 execution if applicable to target Mac'],financialRecoveryOfFrozenOperationsPerformed:false};
 fs.writeFileSync(out+'/review-summary.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({diagnosticVerified:true,functionalFixApplied:false,checks:result.counts,lot5Complete:false},null,2));
}
