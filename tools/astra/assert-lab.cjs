const {execFileSync}=require('node:child_process');
module.exports=function(){
 const project='primax-astra-qa';
 for(const [service,port] of [['frontend1',28181],['fuelflow-t02',28184],['frontend2',28182],['frontend3',28183]]){
  const ids=execFileSync('docker',['ps','-q','--filter',`label=com.docker.compose.project=${project}`,'--filter',`label=com.docker.compose.service=${service}`],{encoding:'utf8'}).trim().split(/\s+/);
  if(ids.length!==1||!ids[0])throw Error('QA service missing: '+service);
  const c=JSON.parse(execFileSync('docker',['inspect',ids[0]],{encoding:'utf8'}))[0];
  if(!c.NetworkSettings.Ports['80/tcp']?.some(p=>p.HostIp==='127.0.0.1'&&Number(p.HostPort)===port))throw Error('QA port mismatch');
 }
 const db=JSON.parse(execFileSync('docker',['inspect',project+'-postgres-1'],{encoding:'utf8'}))[0];
 if(!db.Config.Env.includes('POSTGRES_DB=astra_qa_local')||db.Mounts.some(m=>m.Type!=='volume'||!m.Name.startsWith(project+'_')))throw Error('QA database isolation mismatch');
};
