const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(process.argv[2]==='--inside'){
  fs.cpSync('/source/Backend','/tmp/continuation-backend',{recursive:true,filter:p=>!p.split('/').some(s=>['node_modules','dist','build','.cache','.git'].includes(s)||s.startsWith('.env'))});
  fs.symlinkSync('/app/node_modules','/tmp/continuation-backend/node_modules','dir');
  const r=cp.spawnSync(process.execPath,['/app/node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath',...['transactions/captured-continuation.spec.ts','transactions/authorizations.service.spec.ts','transactions/authorization-commands.spec.ts','transactions/transactions.service.spec.ts','payments/order-workflow.spec.ts','payments/payment-workflow.spec.ts','payments/payments.service.spec.ts','payments/payment-provider.spec.ts','kiosk/kiosk.spec.ts','kiosk/kiosk-http.spec.ts','kiosk/terminal-recovery-access.spec.ts','kiosk/terminal-recovery.spec.ts'].map(f=>'src/'+f),'--json','--outputFile=/evidence/backend-results.json'],{cwd:'/tmp/continuation-backend',encoding:'utf8'});
  fs.writeFileSync('/evidence/backend.log',r.stdout+r.stderr);console.log((r.stdout+r.stderr).slice(-5000));process.exitCode=r.status??1;
}else{
 const root=path.resolve(__dirname,'../..'),dir=path.join(root,'Docs/astra/evidence/lot5-captured-continuation/unit');fs.mkdirSync(dir,{recursive:true});
 const r=cp.spawnSync('docker',['run','--rm','--network','none','--mount','type=bind,source='+root+',target=/source,readonly','--mount','type=bind,source='+dir+',target=/evidence','--entrypoint','node','primax-astra-stage2-validation:test','/source/tools/astra/lot5-continuation-unit.cjs','--inside'],{stdio:'inherit',windowsHide:true});process.exitCode=r.status??1;
}
