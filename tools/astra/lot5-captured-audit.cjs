// Read-only audit of captured diagnostic artifacts; never starts a service or calls a financial endpoint.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');process.chdir(root);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exec=(bin,args)=>cp.execFileSync(bin,args,{encoding:'utf8',windowsHide:true,maxBuffer:32e6});
const prefix='Docs/astra/evidence/lot5-captured-diagnostic/';
const evidence=name=>read(prefix+'new/'+name+'.json');
const expectedDocs=['Docs/astra/primax-lot5-final-report.md','Docs/astra/primax-lot5-known-incidents.md','Docs/astra/primax-stage3j-definitive-hexagonal-closure-plan.md'];
const manifest=read('.cache/astra-lot5-captured/initial-manifest.json');
const changed=manifest.filter(x=>sha(x.file)!==x.sha256).map(x=>x.file);
assert.deepEqual(changed.sort(),expectedDocs.sort());
assert.equal(exec('git',['branch','--show-current']).trim(),'feat/dezkz-identity-a4-core');
exec('git',['merge-base','--is-ancestor','c1184c1f5a7416830f3e1c281ee14bb0bf40a9ef','HEAD']);
const historical=read('Docs/astra/evidence/lot5-validation/integrity.json').historicalEvidence;
assert.equal(historical.length,9);
const tracked=new Set(exec('git',['ls-files','-z']).split('\0'));
for(const x of historical){assert.equal(sha(x.file),x.sha256);assert(!tracked.has(x.file));}
const pg=evidence('captured-result-unknown').postgres;
for(const label of ['after-concurrent-reads','after-lost-id','final-before-stop'])assert.deepEqual(evidence(label).postgres,pg);
assert.equal(pg.orders.length,1);assert.equal(pg.payments.length,1);
assert.equal(pg.orders[0].status,'CAPTURED');assert.equal(pg.payments[0].status,'CAPTURED');assert.equal(Number(pg.payments[0].amount),20);
for(const name of ['transactions','receipts','authorizations'])assert.equal(pg[name].length,0);
assert.equal(pg.reservations.length,1);assert.equal(pg.reservations[0].status,'PENDING_PAYMENT');
assert.equal(Number(pg.reservations[0].consumedLiters),0);assert.equal(Number(pg.reservations[0].releasedLiters),0);
assert.equal(pg.paymentEvents.filter(x=>x.kind==='CAPTURED').length,1);
for(const label of ['pending','captured-result-unknown','after-concurrent-reads','after-lost-id','final-before-stop'])assert.equal(evidence(label).redis.ping,'PONG');
const browser=evidence('browser');assert.equal(browser.confirmationAttempts,1);assert.deepEqual(browser.forbiddenAttempts,[]);assert.deepEqual(browser.uncaughtErrors,[]);
assert.equal(browser.committedResponseNotDelivered.httpStatus,201);assert.equal(browser.committedResponseNotDelivered.id,pg.orders[0].id);
assert(!browser.requests.some(x=>x.method==='POST'&&/\/(authorizations|transactions)(\/|$)/.test(x.path)));
const state=label=>browser.states.find(x=>x.label===label);
assert(state('captured-block').message.includes('CAPTURED'));assert(state('lost-id-block').message.includes('asistencia'));
assert.equal(state('ordinary-credential-recovery-state').status,403);
assert.equal(state('concurrent-reads').results.length,3);
for(const x of state('concurrent-reads').results){assert.equal(x.id,pg.orders[0].id);assert.equal(x.status,'CAPTURED');assert.equal(x.transactionId,null);}
const admission=evidence('readonly-admission');assert.equal(admission.transactionReadOnly,true);assert.equal(admission.admission.httpStatus,409);assert.equal(admission.admission.accepted,false);
assert.equal(Object.keys(admission.checks).length,11);assert(Object.values(admission.checks).every(x=>x===true));
assert.equal(admission.infrastructure.migrations,36);assert.equal(admission.infrastructure.unvalidatedForeignKeys,0);
assert(admission.infrastructure.sequences.filter(x=>x.sequencename.startsWith('receipt_')).every(x=>x.last_value===null));
const control=evidence('control-readonly');assert.equal(control.detailStatus,200);assert.deepEqual(control.allowedActions,['ESCALATE']);assert.deepEqual(control.actionsExecuted,[]);
const reused=read(prefix+'reused-evidence.json');assert.equal(reused.pairedCheckpoints,756);assert.equal(reused.families.length,6);
for(const family of reused.families){assert(family.notReexecuted&&family.recomparedCanonicalSnapshots);for(const a of family.artifacts)assert.equal(sha(a.file),a.sha256);}
const replay=reused.previousCapturedReplay.sourceFiles;assert.deepEqual(read(replay[0]).postgres,read(replay[1]).postgres);
assert.equal(exec('git',['diff','9d57edea9bf047ac8e5d05833ec752bb82572591','HEAD','--','Backend']).trim(),'');
const tap=fs.readFileSync(prefix+'predicates.log','utf8');assert(/^# pass 4$/m.test(tap));assert(/^# fail 0$/m.test(tap));
const project=evidence('isolation').project;
assert(/^primax-astra-lot5-captured-[a-f0-9]+$/.test(project));
const privateDir=path.join('.cache/astra-lot5-captured',project),lab=read(path.join(privateDir,'lab-private.json'));
const docker=args=>exec('docker',args);
const containers=p=>{const ids=docker(['ps','-aq','--filter','label=com.docker.compose.project='+p]).trim().split(/\s+/).filter(Boolean);return ids.length?JSON.parse(docker(['inspect',...ids])):[];};
const safe=cs=>cs.map(c=>({id:c.Id,service:c.Config.Labels['com.docker.compose.service'],image:c.Image,state:c.State.Status,health:c.State.Health?.Status||null,exitCode:c.State.ExitCode,restarts:c.RestartCount,startedAt:c.State.StartedAt,mounts:c.Mounts.map(m=>({type:m.Type,name:m.Name,destination:m.Destination}))})).sort((a,b)=>a.id.localeCompare(b.id));
const before=read(path.join(privateDir,'protected-before.json'));
const protectedProjects=[];
for(const[p,cs]of Object.entries(before)){assert.deepEqual(safe(containers(p)),cs.sort((a,b)=>a.id.localeCompare(b.id)));protectedProjects.push({project:p,containers:cs.length,unchanged:true});}
const stopped=safe(containers(project));assert.equal(stopped.length,17);assert(stopped.every(x=>x.state==='exited'&&x.exitCode===0));
const volumes=[...new Set(stopped.flatMap(c=>c.mounts.filter(m=>m.type==='volume').map(m=>m.name)))];assert.equal(volumes.length,4);
for(const name of volumes){assert(name.startsWith(project+'_'));docker(['volume','inspect',name]);}
const files=[];function walk(p){for(const d of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,d.name);if(d.isDirectory())walk(f);else files.push(f);}}walk(prefix);
const deliverables=files.concat(['Docs/astra/primax-lot5-captured-financial-diagnostic.md',...expectedDocs,...['diagnostic.cjs','readonly-probe.cjs','predicates.mjs','audit.cjs'].map(s=>'tools/astra/lot5-captured-'+s)]);
const secrets=Object.entries(lab.env).filter(([k])=>/^(POSTGRES_PASSWORD|REDIS_PASSWORD|JWT_SECRET|KIOSK_API_KEY|KIOSK_GATEWAY_SECRET|OCR_SERVICE_SECRET|KIOSK_OPERATOR_PASSWORD_HASH|DEMO_PASSWORD|DEMO_CONTROL_ADMIN_PASSWORD|DEMO_ENCARGADO_PASSWORD)$/.test(k)).map(([,v])=>v).concat(lab.operatorPassword);
for(const file of deliverables){const s=fs.readFileSync(file).toString('utf8');for(const secret of secrets)assert(!s.includes(secret),'Private value in '+file);assert(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(s),'JWT in '+file);}
for(const file of ['Docs/astra/primax-lot5-captured-financial-diagnostic.md']){const s=fs.readFileSync(file,'utf8');for(const match of s.matchAll(/\]\(([^)]+)\)/g)){if(!match[1].includes('://'))assert(fs.existsSync(path.resolve(path.dirname(file),match[1].split('#')[0])),match[1]);}}
const report={reference:'c1184c1f5a7416830f3e1c281ee14bb0bf40a9ef',diagnosisOnly:true,financialFixImplemented:false,lot5Complete:false,severity:'P1',newPureTestsPassed:4,reusedHistoricalCheckpoints:756,oneNewSyntheticCapture:true,repeatedCaptureExecuted:false,authorizations:0,sales:0,receipts:0,financialSnapshotsUnchangedAfterCapture:true,readOnlyAdmissionStatus:409,controlActions:['ESCALATE'],historicalFilesIntact:9,applicationAndPreviousEvidenceUnchanged:true,changedPreviouslyTrackedFiles:changed,protectedProjects,newLaboratoryStopped:17,newVolumesRetained:volumes,secretScanPassed:true,sourceFilesHashed:manifest.filter(x=>/^(Backend|Frontend_1_FuelFlow)\//.test(x.file)).length,artifactHashes:files.filter(f=>!f.endsWith('review-summary.json')).map(file=>({file:file.replaceAll('\\','/'),sha256:sha(file)}))};
fs.writeFileSync(prefix+'review-summary.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
