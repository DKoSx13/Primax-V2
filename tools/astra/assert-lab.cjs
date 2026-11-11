const {execFileSync}=require('node:child_process');
module.exports=function(){
 const project='primax-astra-qa';
 for(const [service,port] of [['frontend1',28181],['fuelflow-t02',28184],['frontend2',28182],['frontend3',28183]]){
  const c=JSON.parse(execFileSync('docker',['inspect',`${project}-${service}-1`],{encoding:'utf8',timeout:15000}))[0];
  if(c.State.Status!=='running'||c.Config.Labels['com.docker.compose.project']!==project||c.Config.Labels['com.docker.compose.service']!==service)throw Error('QA service identity mismatch: '+service);
  if(!c.NetworkSettings.Ports['80/tcp']?.some(p=>p.HostIp==='127.0.0.1'&&Number(p.HostPort)===port))throw Error('QA port mismatch');
 }
 const db=JSON.parse(execFileSync('docker',['inspect',project+'-postgres-1'],{encoding:'utf8',timeout:15000}))[0];
 if(db.Config.Labels['com.docker.compose.project']!==project||db.Config.Labels['com.docker.compose.service']!=='postgres'||!db.Config.Env.includes('POSTGRES_DB=astra_qa_local')||db.Mounts.some(m=>m.Type!=='volume'||!m.Name.startsWith(project+'_')))throw Error('QA database isolation mismatch');
};
