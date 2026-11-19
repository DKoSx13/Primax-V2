const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const folder = path.join(root, '.cache/astra-stage2b2');
const statePath = path.join(folder, 'private-state.json');
const file = path.join(folder, 'compose.json');
const env = Object.fromEntries(['PATH','SystemRoot','COMSPEC','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP','TMP','ProgramFiles','ProgramFiles(x86)','ProgramData','ALLUSERSPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
function docker(args, input) {
  const r = spawnSync('docker', ['--context', 'desktop-linux', ...args], { cwd: root, env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'failure-' + Date.now() + '.json'), JSON.stringify({ stdout: r.stdout, stderr: r.stderr }));
    throw Error('Docker operation failed; diagnostic retained in private cache');
  }
  return r.stdout;
}
function state() { return JSON.parse(fs.readFileSync(statePath)); }
function compose(args) {
  const s = state();
  assert(/^primax-astra-stage2b2-[a-f0-9]{10}$/.test(s.project));
  return docker(['compose','--env-file',path.join(folder,'empty.env'),'-p',s.project,'-f',file,...args]);
}
function inspect(service) {
  const id = compose(['ps','-a','-q',service]).trim();
  assert(id, 'Missing test container');
  const [c] = JSON.parse(docker(['inspect', id]));
  assert.equal(c.Config.Labels['com.docker.compose.project'], state().project);
  assert.equal(c.Config.Labels['com.docker.compose.service'], service);
  assert((c.Mounts || []).every(m => m.Type === 'bind' ? !m.RW : m.Name.startsWith(state().project + '_')));
  return c;
}
function prepare() {
  assert(!fs.existsSync(statePath), 'Preserve existing run; do not overwrite');
  fs.mkdirSync(folder, { recursive: true });
  const project = 'primax-astra-stage2b2-' + crypto.randomBytes(5).toString('hex');
  const network = project + '_data', volume = project + '_print';
  const ids = docker(['network','ls','-q']).trim().split(/\s+/).filter(Boolean);
  const networks = JSON.parse(docker(['network','inspect',...ids]));
  function range(cidr) { const [ip,bits] = cidr.split('/'), n = ip.split('.').reduce((a,v) => a*256+Number(v),0), size = 2**(32-Number(bits)); return [Math.floor(n/size)*size,Math.floor(n/size)*size+size-1]; }
  const subnet = '10.253.214.0/27', [a,b] = range(subnet);
  for (const n of networks) for (const x of n.IPAM.Config || []) if (x.Subnet?.includes('.')) {
    const [v,w] = range(x.Subnet); assert(!(a<=w && v<=b), 'Test subnet already used');
  }
  const health = port => ({ test:['CMD','node','-e',`fetch('http://127.0.0.1:${port}/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`],interval:'1s',timeout:'2s',retries:15 });
  const common = { networks:['data'],restart:'no',stop_grace_period:'10s',security_opt:['no-new-privileges:true'] };
  const services = { backend: { ...common,image:'primax-astra-stage2-baseline:test',pull_policy:'never',command:['node','/fixture.cjs'],volumes:[{type:'bind',source:path.join(root,'tools/astra/stage2b2-backend.cjs'),target:'/fixture.cjs',read_only:true}] } };
  const key = crypto.randomBytes(32).toString('hex');
  for (const [service,scope] of [['bff-t01','31181'],['bff-t02','31184']]) services[service] = {
    ...common,image:project+'-bff:test',build:{context:path.join(root,'Frontend_1_FuelFlow'),target:'gateway'},
    environment:{FUELFLOW_LOCAL_HTTP:'true',FUELFLOW_PUBLIC_ORIGIN:'http://127.0.0.1:'+scope,FUELFLOW_COOKIE_SCOPE:scope,BACKEND_ORIGIN:'http://backend:3000',KIOSK_GATEWAY_SECRET:key},healthcheck:health(3001),
  };
  services.print = { ...common,image:project+'-print:test',build:{context:path.join(root,'PrintAgent')},volumes:[{type:'volume',source:'print',target:'/data'}],healthcheck:{...health(3000),test:['CMD','node','-e',"fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]} };
  const c = { name:project,services,networks:{data:{name:network,internal:true,ipam:{config:[{subnet}]}}},volumes:{print:{name:volume}} };
  for (const [kind,name] of [['network',network],['volume',volume]]) {
    const r = spawnSync('docker',['--context','desktop-linux',kind,'inspect',name],{env,stdio:'ignore',windowsHide:true});
    assert.notEqual(r.status,0,'Existing resource rejected');
  }
  fs.writeFileSync(path.join(folder,'empty.env'),'');
  fs.writeFileSync(file,JSON.stringify(c,null,2));
  fs.writeFileSync(statePath,JSON.stringify({project,network,volume,subnet},null,2));
  compose(['config','--quiet']);
  console.log('Prepared exclusive no-port project ' + project);
}
function probe() {
  const child = spawn('docker',['--context','desktop-linux','run','--rm','-i','--network',state().network,'--label','com.docker.compose.project='+state().project,'--mount','type=bind,source='+path.join(root,'tools/astra/stage2b2-probe.cjs')+',target=/probe.cjs,readonly','primax-astra-stage2-baseline:test','node','/probe.cjs'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let sequence=0;
  const pending=new Map();
  const input=readline.createInterface({input:child.stdout});
  input.on('line',line=>{const x=JSON.parse(line),p=pending.get(x.id);if(!p)return;pending.delete(x.id);clearTimeout(p.timer);x.error?p.reject(Error(x.error)):p.resolve(x.result);});
  child.stderr.on('data',b=>fs.appendFileSync(path.join(folder,'probe-stderr.log'),b));
  child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Probe exited'));}pending.clear();});
  return { request(m) { return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Probe RPC timeout'));},16000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({...m,id})+'\n');}); }, close() { child.stdin.end(); } };
}
const origin = service => 'http://127.0.0.1:'+(service==='bff-t01'?'31181':'31184');
function headers(service) { return {Origin:origin(service),'X-FuelFlow-Request':'1'}; }
function raw(service,method,route,body='',extra={}) {
  const h = {...(service==='print'?{}:headers(service)),Connection:'keep-alive',...extra};
  return `${method} ${route} HTTP/1.1\r\nHost: ${service}\r\n`+Object.entries(h).map(([k,v])=>`${k}: ${v}\r\n`).join('')+'\r\n'+body;
}
function receipt() { return {schemaVersion:2,id:'probe-'+crypto.randomUUID(),documentType:'BOLETA',demo:true,issuedAt:new Date().toISOString(),station:'Fixture',pump:'01',plate:'N/A',dni:'',ruc:'',businessName:'',fuel:'Fixture',gallons:'1.000',unitPrice:'1.00',subtotal:'1.00',discount:'0.00',total:'1.00',mode:'PREPAGO',paymentMethod:'DEMO',state:'Pagado',pending:'0.00'}; }
async function waitFor(fn,timeout=3000) { const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Test condition not reached'); }
function signal(service,kind) { const c=inspect(service);assert.equal(c.State.Status,'running');docker(['kill','--signal',kind,c.Id]); }
async function result(service,start,since) {
  await waitFor(()=>inspect(service).State.Status==='exited',11000);
  const c=inspect(service),until=new Date();
  const events=docker(['events','--since',since.toISOString(),'--until',until.toISOString(),'--filter','container='+c.Id,'--format','{{json .}}']).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
  const r={service,exitCode:c.State.ExitCode,oomKilled:c.State.OOMKilled,elapsedMilliseconds:Math.round(performance.now()-start),signals:events.filter(x=>x.Action==='kill').map(x=>Number(x.Actor.Attributes.signal)),stopTimeoutSeconds:c.Config.StopTimeout};
  assert.equal(r.stopTimeoutSeconds,10);assert(!r.signals.includes(9),'Docker used SIGKILL');assert.equal(r.oomKilled,false);
  return r;
}
async function main() {
  if (process.argv[2]==='prepare') return prepare();
  if (process.argv[2]==='stop') return console.log(compose(['stop']));
  assert.equal(process.argv[2],'test');
  let client;
  const results=[],contracts=[];
  const runFolder=path.join(folder,'run-'+crypto.randomBytes(5).toString('hex'));
  fs.mkdirSync(runFolder);
  try {
    console.log(compose(['up','-d','--build','--wait','--wait-timeout','90']));
    client=probe();
    const request=m=>client.request({op:'request',...m});
    const control=path=>request({target:'backend',path});
    // Normal HTTP paths are checked before signals; no financial endpoints.
    for(const service of ['bff-t01','bff-t02']){
      assert.equal((await request({target:service,path:'/healthz'})).status,200);
      const r=await request({target:service,path:'/api/v1/fuels',headers:headers(service)});assert.equal(r.status,200);assert.deepEqual(JSON.parse(r.text),[{code:'FIXTURE',pricePerGallon:'1.00'}]);
      assert.equal((await request({target:service,path:'/api/v1/fuels',headers:{...headers(service),Origin:'https://invalid.example'}})).status,403);
      contracts.push({service,health:200,catalogue:200,foreignOrigin:403});
    }
    const job=receipt(),jobPath='/api/v1/demo-print/jobs/receipt-'+job.id;
    const post=body=>request({target:'print',path:jobPath,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const initial=await post(job);assert.equal(initial.status,200);assert.equal(JSON.parse(initial.text).simulation,true);assert.equal(JSON.parse(initial.text).physicalConfirmed,false);
    const replay=await post(job);assert.equal(replay.status,initial.status);assert.equal(replay.text,initial.text);
    assert.equal((await post({...job,total:'2.00'})).status,409);
    contracts.push({service:'print',accepted:200,replay:200,conflict:409,simulation:true,physicalConfirmed:false});
    for(const service of ['bff-t01','bff-t02','print']){
      for(const sig of ['SIGTERM','SIGINT']){
        compose(['up','-d','--no-build','--no-deps','--wait','--wait-timeout','30',service]);
        const since=new Date(),start=performance.now();
        if(sig==='SIGTERM')compose(['stop',service]);else signal(service,sig);
        const r=await result(service,start,since);assert.equal(r.exitCode,0);assert(r.elapsedMilliseconds<8000);results.push({case:'idle-'+sig,...r});
        console.log('PASS '+service+' idle '+sig+' exit 0');
      }
      compose(['up','-d','--no-build','--no-deps','--wait','--wait-timeout','30',service]);
      const key='active-'+service;
      let tail,blockedJob;
      const beforeStatus=JSON.parse((await control('/_test/status')).text);
      if(service==='print'){
        blockedJob=receipt();const body=JSON.stringify(blockedJob),split=Math.floor(body.length/2);
        await client.request({op:'open',key,target:service,text:raw(service,'POST','/api/v1/demo-print/jobs/receipt-'+blockedJob.id,body.slice(0,split),{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),Expect:'100-continue'})});
        await waitFor(async()=> (await client.request({op:'received',key})).bytes>0);
        const rejected=receipt(),body2=JSON.stringify(rejected);
        tail=body.slice(split)+raw(service,'POST','/api/v1/demo-print/jobs/receipt-'+rejected.id,body2,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body2)});
        blockedJob.rejectedId=rejected.id;
      }else{
        await control('/_test/hold');
        await client.request({op:'open',key,target:service,text:raw(service,'GET','/api/v1/fuels')});
        await waitFor(async()=>JSON.parse((await control('/_test/status')).text).waiting===1);
        tail=raw(service,'GET','/api/v1/stations');
      }
      const since=new Date(),start=performance.now();signal(service,'SIGTERM');signal(service,'SIGINT');signal(service,'SIGTERM');
      const fresh=await request({target:service,path:service==='print'?'/api/v1/health':'/healthz',headers:service==='print'?{}:headers(service)});assert(fresh.networkError||fresh.status===503,'New connection admitted while draining');
      await client.request({op:'append',key,text:tail});if(service!=='print')await control('/_test/release');
      const response=await client.request({op:'collect',key});const statuses=[...response.text.matchAll(/HTTP\/1\.1 (\d{3})/g)].map(x=>Number(x[1])).filter(x=>x!==100);
      assert.deepEqual(statuses,[200,503],'In-flight response or pipelined rejection changed');
      const r=await result(service,start,since);assert.equal(r.exitCode,0);assert(r.elapsedMilliseconds<8000);
      if(service!=='print'){const after=JSON.parse((await control('/_test/status')).text);assert.equal(after.counts['/api/v1/stations']||0,beforeStatus.counts['/api/v1/stations']||0);}
      results.push({case:'inflight-repeated-signals',...r,statuses,newConnectionRejected:true});console.log('PASS '+service+' drains in-flight, rejects new work, repeated signals exit 0');
      compose(['up','-d','--no-build','--no-deps','--wait','--wait-timeout','30',service]);
      if(service==='print'){
        const got=await request({target:service,path:'/api/v1/demo-print/jobs/receipt-'+blockedJob.id});assert.equal(got.status,200);
        assert.equal((await request({target:service,path:'/api/v1/demo-print/jobs/receipt-'+blockedJob.rejectedId})).status,404);
      }
      // A deliberately unfinished request must fail visibly before Docker's budget.
      const stuck='stuck-'+service;let stuckId;
      if(service==='print'){
        stuckId=receipt().id;
        await client.request({op:'open',key:stuck,target:service,text:raw(service,'POST','/api/v1/demo-print/jobs/receipt-'+stuckId,'{',{'Content-Type':'application/json','Content-Length':500,Expect:'100-continue'})});
        await waitFor(async()=> (await client.request({op:'received',key:stuck})).bytes>0);
      }else{
        await control('/_test/hold');await client.request({op:'open',key:stuck,target:service,text:raw(service,'GET','/api/v1/fuels')});await waitFor(async()=>JSON.parse((await control('/_test/status')).text).waiting===1);
      }
      const timeoutSince=new Date(),timeoutStart=performance.now();compose(['stop',service]);
      const timed=await result(service,timeoutStart,timeoutSince);assert.equal(timed.exitCode,1);assert(timed.elapsedMilliseconds>=7800&&timed.elapsedMilliseconds<10000);
      const logs=docker(['logs',inspect(service).Id]); // stdout and stderr are saved separately below.
      const rawLogs=spawnSync('docker',['--context','desktop-linux','logs',inspect(service).Id],{env,encoding:'utf8',windowsHide:true});
      assert(rawLogs.stderr.includes('shutdown deadline exceeded'));fs.writeFileSync(path.join(runFolder,service+'-deadline.log'),logs+rawLogs.stderr);
      await client.request({op:'collect',key:stuck});if(service!=='print')await control('/_test/release');
      results.push({case:'deadline-failure',...timed,fixedReasonLogged:true});console.log('PASS '+service+' deadline exit 1, no SIGKILL');
      compose(['up','-d','--no-build','--no-deps','--wait','--wait-timeout','30',service]);
      if(service==='print')assert.equal((await request({target:service,path:'/api/v1/demo-print/jobs/receipt-'+stuckId})).status,404);
    }
    assert.equal((await request({target:'print',path:jobPath})).text,initial.text,'Accepted demo job was not preserved');
    fs.writeFileSync(path.join(runFolder,'results.json'),JSON.stringify({passed:true,project:state().project,contracts,results,acceptedPrintJobPreserved:true},null,2));
    console.log('Evidence retained in '+path.basename(runFolder));
  }catch(error){
    fs.writeFileSync(path.join(runFolder,'failure.json'),JSON.stringify({reason:error.message,contracts,results},null,2));
    throw error;
  }finally{
    if(client)client.close();
    // Only this generated project is selected. Volumes/evidence are retained.
    if(fs.existsSync(statePath))compose(['stop']);
  }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={docker,compose,state,folder,inspect};
