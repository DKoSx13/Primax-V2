// Never reads .env or accepts a caller-supplied project/database/port.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const project='primax-astra-qa';
const ports=[28100,28181,28182,28183,28184];
const env={PATH:process.env.PATH,HOME:process.env.HOME,COMPOSE_PROJECT_NAME:project,
 BACKEND_PORT:'28100',FRONTEND1_PORT:'28181',FRONTEND2_PORT:'28182',FRONTEND3_PORT:'28183',FRONTEND1_T02_PORT:'28184',
 POSTGRES_DB:'astra_qa_local',POSTGRES_USER:'astra_qa',
 CORS_ORIGINS:ports.flatMap(p=>[`http://localhost:${p}`,`http://127.0.0.1:${p}`]).join(',')};
function compose(args,capture=false){const r=spawnSync('docker',['compose','--env-file','/dev/null','-p',project,'-f',path.join(root,'compose.yaml'),...args],{cwd:root,env,encoding:'utf8',stdio:capture?'pipe':'inherit'});if(r.status!==0)throw Error(r.stderr||'Compose failed');return r.stdout;}
async function main(){
 const action=process.argv[2];
 if(!['up','stop','status','config'].includes(action))throw Error('Usage: node lab.cjs up|stop|status|config');
 const config=JSON.parse(compose(['config','--format','json'],true));
 for(const resources of [config.volumes,config.networks])for(const resource of Object.values(resources||{}))if(resource.external||!resource.name.startsWith(project+'_'))throw Error('Shared resource rejected');
 for(const s of Object.values(config.services)){
  if(s.container_name)throw Error('Fixed container name rejected');
  for(const p of s.ports||[])if(p.host_ip!=='127.0.0.1'||!ports.includes(Number(p.published)))throw Error('Unexpected port');
  for(const v of s.volumes||[])if(v.type==='bind')throw Error('Bind mount rejected');
 }
 if(action==='up'){
  const net=require('node:net');
  for(const port of ports)await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
  compose(['up','-d','--build','--wait','--wait-timeout','240']);
 }else if(action==='stop')compose(['stop']);
 else if(action==='status')compose(['ps','-a']);
 else console.log('Validated isolated project '+project+'; ports '+ports.join(','));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
