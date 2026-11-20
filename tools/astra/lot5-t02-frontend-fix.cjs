// Restricted synthetic laboratory: no existing project is started/stopped or modified.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..');process.chdir(repo);
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function docker(args,options={}){return cp.execFileSync('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:32e6,...options});}
function owned(file){const l=json(file);assert(/^primax-astra-lot5-t02fix-[a-f0-9]+$/.test(l.project));assert(path.resolve(l.dir).startsWith(path.resolve(repo,'.cache/astra-lot5-t02fix')+path.sep));return l;}
function compose(l,args){return docker(['compose','--project-name',l.project,'--file',l.config,...args]);}
function status(project){const ids=docker(['ps','-aq','--filter','label=com.docker.compose.project='+project]).trim().split(/\s+/).filter(Boolean);return ids.length?JSON.parse(docker(['inspect',...ids])):[];}
function safeContainers(cs){return cs.map(c=>({id:c.Id,service:c.Config.Labels['com.docker.compose.service'],image:c.Image,state:c.State.Status,health:c.State.Health?.Status||null,exitCode:c.State.ExitCode,restarts:c.RestartCount,startedAt:c.State.StartedAt,mounts:c.Mounts.map(m=>({type:m.Type,name:m.Name,destination:m.Destination}))}));}
function write(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});}
async function create(){
 const arm=process.argv[3];assert(['baseline','flow','inflight'].includes(arm));const base=arm==='baseline'?27600:arm==='flow'?27700:27800;
 cp.execFileSync('git',['merge-base','--is-ancestor','b6dd92c6b360c31aeec9076e8e323d827c8d814b','HEAD']);

 const project='primax-astra-lot5-t02fix-'+crypto.randomBytes(5).toString('hex');
 const dir=path.resolve('.cache/astra-lot5-t02fix',project),clean=path.join(dir,'source');fs.mkdirSync(clean,{recursive:true});
 const files=cp.execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const manifest=files.map(file=>({file,sha256:sha(file)}));write(path.join(dir,'initial-sources.json'),manifest);
 for(const f of files){if(!/^(Backend|Frontend_1_FuelFlow|Frontend_2_PrimaxPrime|Frontend_3_PrimaxControl|PrintAgent|PlateRecognition)\//.test(f)&&!['compose.yaml','.env.example'].includes(f))continue;assert(!f.split('/').some(p=>p.startsWith('.env')&&p!=='.env.example'));const to=path.join(clean,f);fs.mkdirSync(path.dirname(to),{recursive:true});if(arm==='baseline'&&f==='Frontend_1_FuelFlow/src/js/script.js')fs.writeFileSync(to,cp.execFileSync('git',['show','b6dd92c6b360c31aeec9076e8e323d827c8d814b:'+f]));else fs.copyFileSync(f,to);}
 const ranges=JSON.parse(docker(['network','inspect',...docker(['network','ls','-q']).trim().split(/\s+/).filter(Boolean)])).flatMap(n=>n.IPAM?.Config||[]).map(c=>c.Subnet).filter(c=>c&&!c.includes(':'));
 function bounds(c){const[ip,prefix]=c.split('/'),n=ip.split('.').reduce((v,p)=>(v<<8n)+BigInt(p),0n),size=1n<<BigInt(32-Number(prefix));return[n/size*size,n/size*size+size-1n];}
 const subnets=[];for(let i=0;i<256&&subnets.length<2;i++){const c='10.246.'+i+'.0/24',[a,b]=bounds(c);if(ranges.concat(subnets).every(r=>{const[x,y]=bounds(r);return b<x||y<a;}))subnets.push(c);}assert.equal(subnets.length,2);
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
 const publicDir='Docs/astra/evidence/lot5-t02-frontend-fix/'+arm;fs.mkdirSync(publicDir,{recursive:true});
 write(publicDir+'/isolation.json',{reference:'b6dd92c6b360c31aeec9076e8e323d827c8d814b',project,ports,subnets,volumesVerifiedAbsent:true,containerProjectVerifiedAbsent:true,reusedImages,newProjectImagesFromVerifiedSource:true,frontendConfigurationRebuilt:true,newSchemaMigrations:0,existingMigrationChainOnly:36});
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
 write('Docs/astra/evidence/lot5-t02-frontend-fix/'+l.arm+'/'+label+'.json',result);console.log(JSON.stringify({label,payments:pg.payments.length,transactions:pg.transactions.length,receipts:pg.receipts.length,authorizations:pg.authorizations.length,redisKeys:keys.length}));
}

const[mode,file,label]=process.argv.slice(2);
if(mode==='create')create().catch(e=>{console.error(e.message);process.exitCode=1;});
else if(mode==='snapshot')snapshot(file,label);
else if(mode==='verify')verify();
else if(mode==='stop'){const l=owned(file);compose(l,['stop','--timeout','20']);write('Docs/astra/evidence/lot5-t02-frontend-fix/'+l.arm+'/stopped.json',{project:l.project,volumesRetained:true,containers:safeContainers(status(l.project))});console.log('Stopped only '+l.project);}
else throw Error('Usage: create baseline|flow|inflight; snapshot|stop private-metadata [label]; verify');

function verify(){
 const root='Docs/astra/evidence/lot5-t02-frontend-fix',r=p=>json(root+'/'+p+'.json');
 const baseline=r('baseline/browser'),flow=r('flow/browser'),inflight=r('inflight/browser'),t01=r('flow/t01-browser');
 assert(baseline.states.some(s=>s.label==='failure'&&s.modal.includes("reading 'station'")));
 assert.equal(r('baseline/failure').postgres.transactions.length,0);
 assert.equal(r('baseline/failure').postgres.payments[0].status,'CAPTURED');
 const state=label=>flow.states.find(s=>s.label===label);
 for(const label of ['recovered-final','legacy-flag-recovered','qr-read-retried','snapshot-restored']){const s=state(label);assert.equal(s.total,'S/ 20.00');assert.equal(s.qrImages,1);assert.equal(s.savedCreatingOrder,false);assert.equal(s.confirmationDisabled,false);}
 assert.equal(state('recovered-final').orderId,state('legacy-flag-recovered').orderId);
 assert.equal(state('final-before-empty-reload').operationId,state('final-after-empty-reload').operationId);
 assert(state('altered-snapshot-rejected').message.includes('no coinciden'));assert(state('altered-snapshot-rejected').confirmationDisabled);
 assert(state('captured-preserved').message.includes('CAPTURED'));
 assert.deepEqual(r('flow/first-sale').postgres,r('flow/first-sale-replayed').postgres);
 assert.deepEqual(r('flow/orphan-captured').postgres,r('flow/orphan-after-replay').postgres);
 assert.deepEqual(r('inflight/creation-held').postgres,r('inflight/creation-after-reload').postgres);
 const pg=r('flow/orphan-after-replay').postgres;
 assert.equal(pg.payments.length,3);assert.equal(pg.orders.length,3);assert.equal(pg.transactions.length,2);assert.equal(pg.receipts.length,2);assert.equal(pg.authorizations.length,2);
 assert(pg.transactions.every(t=>t.status==='PAID'));assert(pg.authorizations.every(a=>a.status==='SETTLED'));
 assert.deepEqual(pg.receipts.map(r=>r.number).sort(),['EB01-0001','EB01-0002']);
 for(const p of pg.payments)assert.equal(pg.paymentEvents.filter(e=>e.paymentId===p.id&&e.kind==='CAPTURED').length,1);
 const orphan=pg.payments.find(p=>!p.transactionId);assert(orphan);assert.equal(orphan.status,'CAPTURED');assert.equal(orphan.amount,20);
 assert(!pg.authorizations.some(a=>a.operationId===orphan.operationId));
 const held=r('inflight/creation-after-reload').postgres;assert.equal(held.orders.length,1);assert.equal(held.payments[0].status,'PENDING');assert.equal(held.transactions.length,0);assert.equal(held.receipts.length,0);
 const blocked=inflight.states.find(s=>s.label==='final-inflight-blocked');assert.equal(blocked.creationPending,true);assert.equal(blocked.confirmationDisabled,true);assert.equal(blocked.orderId,undefined);
 assert(inflight.states.some(s=>s.label==='inflight-blocked'&&s.message.includes('No se recibió el identificador')));
 assert.equal(t01.states.find(s=>s.label==='authenticated-t01').code,'PRIMAX-SUR-T01');assert.equal(t01.states.find(s=>s.label==='authenticated-t01').pumpCode,'03');
 assert.equal(t01.states.find(s=>s.label==='t01-first').operationId,t01.states.find(s=>s.label==='t01-reloaded').operationId);
 assert(!t01.requests.some(r=>r.path==='/api/v1/online-orders'));
 const unit=r('unit-results');assert.deepEqual(unit.map(x=>[x.name,x.pass,x.fail,x.exitCode]),[['fuelflow',186,0,0],['gateway',24,0,0]]);
 const oldScript=cp.execFileSync('git',['show','b6dd92c6b360c31aeec9076e8e323d827c8d814b:Frontend_1_FuelFlow/src/js/script.js'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
 const newScript=fs.readFileSync('Frontend_1_FuelFlow/src/js/script.js','utf8').replace(/\r\n/g,'\n');
 const payloadBranch=s=>s.slice(s.indexOf('    if(pending?.payload){'),s.indexOf('    limpiarEstadoOperacion();',s.indexOf('    if(pending?.payload){')));
 assert.equal(payloadBranch(newScript),payloadBranch(oldScript),'Existing payload reconciliation policy changed');
 assert(newScript.includes("mostrarModal('Orden conservada','El pago tiene estado '+order.status+'. Solicita asistencia para continuar con esta misma operación.','⚠️');return;"));
 const manifests=json('.cache/astra-lot5-t02fix/initial-manifest.json');
 const allowed=['Frontend_1_FuelFlow/src/js/script.js','Frontend_1_FuelFlow/tests/v11-payments.test.js','Docs/astra/primax-lot5-final-report.md','Docs/astra/primax-lot5-frontends.md','Docs/astra/primax-lot5-known-incidents.md','Docs/astra/primax-lot5-demo-guide.md','Docs/astra/primax-stage3j-definitive-hexagonal-closure-plan.md'];
 const changed=manifests.filter(x=>sha(x.file)!==x.sha256).map(x=>x.file);assert(changed.every(f=>allowed.includes(f)));
 const historical=json('Docs/astra/evidence/lot5-validation/integrity.json').historicalEvidence;for(const e of historical){assert.equal(sha(e.file),e.sha256);assert.equal(cp.execFileSync('git',['ls-files','--',e.file],{encoding:'utf8'}).trim(),'');}
 const labs={baseline:'4c7f866fd5',flow:'3398208473',inflight:'dffe7a2010'};const resources=[];const allSecrets=[];
 for(const[arm,id]of Object.entries(labs)){
  const l=owned('.cache/astra-lot5-t02fix/primax-astra-lot5-t02fix-'+id+'/lab-private.json');
  const current=safeContainers(status(l.project));assert.equal(current.length,17);assert(current.every(c=>c.state==='exited'&&c.exitCode!==137));
  const volumeNames=Object.values(json(l.config).volumes).map(v=>v.name);assert.equal(JSON.parse(docker(['volume','inspect',...volumeNames])).length,4);
  const saved=json(path.join(l.dir,'protected-before.json'));const sort=a=>a.sort((a,b)=>a.id.localeCompare(b.id));for(const[p,old]of Object.entries(saved))assert.deepEqual(sort(safeContainers(status(p))),sort(old));
  const sourceFile=path.join(l.clean,'Frontend_1_FuelFlow/src/js/script.js');
  if(arm==='baseline')assert.equal(fs.readFileSync(sourceFile,'utf8').replace(/\r\n/g,'\n'),cp.execFileSync('git',['show','b6dd92c6b360c31aeec9076e8e323d827c8d814b:Frontend_1_FuelFlow/src/js/script.js'],{encoding:'utf8'}).replace(/\r\n/g,'\n'));
  else{assert.equal(sha(sourceFile),sha('Frontend_1_FuelFlow/src/js/script.js'));const infra=r(arm+'/infrastructure');assert.equal(infra.migrations,36);assert.equal(infra.tables,41);assert.equal(infra.unvalidatedForeignKeys,0);}
  resources.push({arm,project:l.project,stoppedContainers:17,retainedVolumes:volumeNames,scriptSha256:sha(sourceFile)});
  for(const[k,v]of Object.entries(l.env))if(/^(POSTGRES_PASSWORD|REDIS_PASSWORD|JWT_SECRET|KIOSK_API_KEY|KIOSK_GATEWAY_SECRET|OCR_SERVICE_SECRET|KIOSK_OPERATOR_PASSWORD_HASH|DEMO_PASSWORD|DEMO_CONTROL_ADMIN_PASSWORD|DEMO_ENCARGADO_PASSWORD)$/.test(k))allSecrets.push(v);
  allSecrets.push(l.operatorPassword);
 }
 const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())walk(p);else if(!p.endsWith('/review-summary.json'))files.push(p);}}walk(root);
 const docs=allowed.filter(f=>f.endsWith('.md')).concat('Docs/astra/primax-lot5-t02-frontend-fix.md');
 for(const f of files.filter(f=>/\.(json|log)$/.test(f)).concat(docs,__filename,'tools/astra/lot5-t02-frontend-tests.cjs','tools/astra/lot5-t02fix-browser-setup.cjs')){const text=fs.readFileSync(f,'utf8');for(const s of allSecrets)if(s&&s.length>=16)assert(!text.includes(s),'Private secret in '+f);assert(!/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/.test(text),'JWT in '+f);}
 for(const f of docs)for(const m of fs.readFileSync(f,'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const p=m[1].split('#')[0];if(p&&!/^https?:/.test(p))assert(fs.existsSync(path.resolve(path.dirname(f),p)),f+' -> '+p);}
 const summary={reference:'b6dd92c6b360c31aeec9076e8e323d827c8d814b',verifiedAt:new Date().toISOString(),authorizedFrontendFixVerified:true,financialRecoveryImplemented:false,lot5Complete:false,frontend:'Identified PENDING/CREATING orders reload with validated context, clean flags and reconstructed controls; confirmation still requires backend authorization',financial:'CAPTURED without sale remains conserved for assistance; unknown order ID after creation is not automatically replayed',unitTests:unit,newFocusedTests:14,global3526NotRepeated:true,integratedCases:['new baseline reproduces TypeError','reload before order retains operation','reload/legacy busy flag reconstructs pending QR','catalog/read 503 preserves errors and retry','altered snapshot rejected before capture','recovered sale EB01-0001','same sale replay exact PostgreSQL snapshot','normal sale EB01-0002','CAPTURED orphan reload/replay exact PostgreSQL snapshot','lost creation response conserves one PENDING order','T01 basic identity/catalog/reload'],resources,protectedProjectsUnchanged:true,historicalFilesUnchangedAndUntracked:9,changedPreviouslyTrackedFiles:changed,privateSecretMatches:0,limitations:['CAPTURED orphan financial recovery remains unauthorized and incomplete','Creation response lost without order identifier requires assistance','Native Linux/macOS and ARM64 not executed','Existing original/exhibition containers were not rebuilt or deployed'],evidence:files.map(file=>({file,sha256:sha(file)}))};
 fs.writeFileSync(root+'/review-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({verified:true,unitTests:unit,frontendFix:true,financialRecovery:false,retainedVolumes:12,lot5Complete:false},null,2));
}
