// Reproduce the shared AuthCore compilation dependency without editing repository sources.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
if(process.argv[2]==='--inside'){
  const root='/tmp/core-packaging';
  fs.cpSync('/source',root,{recursive:true,filter:p=>{const parts=path.relative('/source',p).split(path.sep);return !parts.some(x=>['node_modules','dist','build','.cache'].includes(x)||x.startsWith('.env'))&&!(parts[0]==='services'&&parts[1]&&parts[1]!=='commerce');}});
  fs.symlinkSync('/app/node_modules',root+'/node_modules','dir');
  const run=name=>{const r=spawnSync(process.execPath,['scripts/build-domain.cjs','commerce'],{cwd:root,encoding:'utf8'});fs.writeFileSync('/evidence/'+name+'.log',(r.stdout||'')+(r.stderr||''));return r;};
  const before=run('original-commerce-context');assert.equal(before.status,0,before.stderr);
  const file=root+'/src/auth/auth.controller.ts';
  fs.writeFileSync(file,"import type { ProfileOperations } from '../../services/identity/src/application/use-cases/profile-operations';\n"+fs.readFileSync(file,'utf8'));
  const after=run('identity-import-in-shared-controller');assert.notEqual(after.status,0);assert.match(after.stdout+after.stderr,/TS2307/);
  fs.writeFileSync('/evidence/results.json',JSON.stringify({network:'none',databases:0,repositoryEdits:0,context:'Same source COPY scope as existing Commerce Dockerfile',originalContextBuildExit:before.status,sharedControllerIdentityImportBuildExit:after.status,expectedDiagnostic:'TS2307: Identity source is outside this independent image build context',authCoreOrOtherDockerfileChangeRequired:true},null,2)+'\n');
  console.log('Confirmed: original Commerce context compiles; Identity import in shared Auth controller fails TS2307.');
}else{
  const repo=path.resolve(__dirname,'../..'),dir=path.join(repo,'.cache/astra-lot2-identity','core-packaging-'+crypto.randomBytes(6).toString('hex'));fs.mkdirSync(dir,{recursive:true});
  const r=spawnSync('docker',['run','--rm','--network','none','--mount','type=bind,source='+path.join(repo,'Backend')+',target=/source,readonly','--mount','type=bind,source='+__filename+',target=/diagnostic.cjs,readonly','--mount','type=bind,source='+dir+',target=/evidence','--entrypoint','node','primax-astra-stage2-validation:test','/diagnostic.cjs','--inside'],{stdio:'inherit',shell:false,windowsHide:true});
  console.log('Diagnostic evidence: '+path.relative(repo,dir));if(r.status!==0)process.exitCode=1;
}
