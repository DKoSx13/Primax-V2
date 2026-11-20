const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
if(process.argv[2]==='--inside'){
const root='/tmp/lot5-clients';const results=[];for(const app of ['Frontend_1_FuelFlow','Frontend_2_PrimaxPrime','Frontend_3_PrimaxControl','PrintAgent']){
const target=root+'/'+app;fs.cpSync('/source/'+app,target,{recursive:true,filter:p=>!path.relative('/source/'+app,p).split(path.sep).some(s=>['node_modules','dist','.git','.cache','build','android'].includes(s)||s.startsWith('.env'))});
}
fs.mkdirSync(root+'/Backend/src/kiosk',{recursive:true});fs.copyFileSync('/source/Backend/src/kiosk/policy.ts',root+'/Backend/src/kiosk/policy.ts');
for(const app of ['Frontend_1_FuelFlow','Frontend_2_PrimaxPrime','Frontend_3_PrimaxControl','PrintAgent']){
const target=root+'/'+app;
const tests=fs.readdirSync(target+'/tests').filter(f=>app==='PrintAgent'?f.endsWith('.test.mjs'):f.endsWith('.test.js'));const args=['--test',...tests.map(f=>'tests/'+f)];const r=cp.spawnSync(process.execPath,args,{cwd:target,encoding:'utf8'});fs.writeFileSync('/evidence/'+app+'.log',(r.stdout||'')+(r.stderr||''));const text=(r.stdout||'')+(r.stderr||'');const passed=Number(text.match(/# pass (\d+)/)?.[1]||0),failed=Number(text.match(/# fail (\d+)/)?.[1]||0);results.push({app,exitCode:r.status,passed,failed});console.log(app+': '+passed+' passed, '+failed+' failed, exit '+r.status);}
fs.writeFileSync('/evidence/results.json',JSON.stringify(results,null,2));process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
}else{const repo=path.resolve(__dirname,'../..'),dir=path.join(repo,'.cache/astra-lot5-clients/run-'+crypto.randomBytes(5).toString('hex'));fs.mkdirSync(dir,{recursive:true});console.log('Evidence: '+path.relative(repo,dir));const r=cp.spawnSync('docker',['run','--rm','--network','none','--mount',`type=bind,source=${repo},target=/source,readonly`,'--mount',`type=bind,source=${__filename},target=/check.cjs,readonly`,'--mount',`type=bind,source=${dir},target=/evidence`,'--entrypoint','node','primax-astra-stage2-validation:test','/check.cjs','--inside'],{stdio:'inherit',windowsHide:true});process.exitCode=r.status||0;}
