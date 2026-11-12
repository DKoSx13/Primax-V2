// Local read-only shadow verification. Never connects to a remote database.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const name='primax-astra-qa-catalog-independent';
const image=name+':local';
const secrets=path.join(root,'Docs/astra/previous-run/catalog.env');
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,...options});
const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
const domains=['identity-service','catalog-service','commerce-service','administration-service','backend'];
const snapshot=()=>Object.fromEntries(domains.map(s=>{const c=inspect('primax-astra-qa-'+s+'-1');return [s,{id:c.Id,started:c.State.StartedAt}];}));
async function main(){
 require('./assert-lab.cjs')();
 const action=process.argv[2];
 if(action==='build'){
  docker(['build','-t',image,path.join(root,'services/catalog')],{stdio:'inherit',timeout:600000});return;
 }
 if(!['verify','restart','stop'].includes(action))throw Error('Usage: catalog.cjs build|verify|restart|stop');
 if(action==='stop'||action==='restart'){
  const c=inspect(name);assert.equal(c.Config.Labels['com.docker.compose.project'],'primax-astra-qa');
  if(action==='stop'){docker(['stop',name]);return;}
  const before=snapshot();docker(['restart',name]);assert.deepEqual(snapshot(),before);
 }
 const before=snapshot();
 if(action==='verify'){
  const db=inspect('primax-astra-qa-postgres-1');
  const env=Object.fromEntries(db.Config.Env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
  assert.equal(env.POSTGRES_DB,'astra_qa_local');assert.equal(env.POSTGRES_USER,'astra_qa');
  const network=Object.keys(db.NetworkSettings.Networks).find(n=>n==='primax-astra-qa_data');assert(network);
  fs.mkdirSync(path.dirname(secrets),{recursive:true});
  const key=randomBytes(32).toString('hex');
  const url=`postgresql://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@primax-astra-qa-postgres-1:5432/astra_qa_local`;
  // Refuse existing containers before replacing their credentials file.
  const existing=docker(['container','ls','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).trim();
  assert.equal(existing,'','Use restart for an existing shadow container');
  fs.writeFileSync(secrets,`APP_ENV=qa\nCATALOG_DATABASE_URL=${url}\nCATALOG_API_KEY=${key}\n`,{mode:0o600});
  docker(['run','-d','--name',name,'--label','com.docker.compose.project=primax-astra-qa',
   '--label','com.docker.compose.service=catalog-independent','--network',network,'--read-only',
   '--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',secrets,'-p','127.0.0.1:28210:3000',image]);
 }
 const key=fs.readFileSync(secrets,'utf8').split('\n').find(s=>s.startsWith('CATALOG_API_KEY=')).slice(16);
 const base='http://127.0.0.1:28210';
 for(let i=0;i<30;i++){
  if(await fetch(base+'/health/ready').then(r=>r.ok).catch(()=>false))break;
  if(i===29)throw Error('Catalog readiness failed');await new Promise(r=>setTimeout(r,1000));
 }
 assert.equal((await fetch(base+'/api/v1/fuels')).status,401);
 const canonical=value=>Array.isArray(value)?value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
 const results=[];
 for(const route of ['fuels','stations','benefits','fuels/inventory']){
  const actual=await fetch(base+'/api/v1/'+route,{headers:{'x-catalog-key':key}});
  const current=await fetch('http://127.0.0.1:28182/api/v1/'+route);
  assert(actual.ok&&current.ok,route+' HTTP');
  const rows=await actual.json();assert.deepEqual(canonical(rows),canonical(await current.json()),route);
  results.push({route,rows:rows.length,parity:true});
 }
 assert.deepEqual(snapshot(),before,'Existing services must not restart');
 const report={result:'PASS',mode:'shadow; existing gateway unchanged',action,results,otherServicesUnchanged:true};
 fs.writeFileSync(path.join(root,'Docs/astra/evidence/catalog-'+action+'.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[database URL redacted]'));process.exitCode=1;});
