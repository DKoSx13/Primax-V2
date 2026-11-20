const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'../..'));
const reference='efcbdc9bc7f68944f0c72c6bbff125f55793f4e4';
const norm=s=>s.replaceAll('\r\n','\n'),read=p=>norm(fs.readFileSync(p,'utf8')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const controller='Backend/src/auth/admin.controller.ts';const old=norm(execFileSync('git',['show',reference+':'+controller],{encoding:'utf8'}));
const equal=old.slice(old.indexOf('const equal ='),old.indexOf("@Controller('admin')"));
const demo=old.slice(old.indexOf('    if (!demoAdminEnabled(this.config))'),old.indexOf("  @Post('login')")).replace(/  }\n$/,'');
const login=old.slice(old.indexOf('    const demo = demoAdminEnabled(this.config);'),old.indexOf("  @Get('alerts')")).replace(/  }\n$/,'');
const engine=read('Backend/src/auth/admin-access.engine.ts');assert(engine.includes(equal));assert(engine.includes('  demo() {\n'+demo+'  }'));assert(engine.includes('  async login(dto: { username: string; password: string }) {\n'+login+'  }'));
let expected=old.replace(equal,'').replace(demo,'    return this.access.demo();\n').replace(login,'    return this.access.login(dto);\n').replace("import { createHash, timingSafeEqual } from 'node:crypto';\n",'').replace("import { compare } from 'bcryptjs';\n",'').replace('  UnauthorizedException,\n','');
expected="import { composeAdminAccessOperations } from '../../services/identity/src/bootstrap/admin-access-operations.composition';\n"+expected;
expected=expected.replace('  private readonly boundary:','  private readonly access: ReturnType<typeof composeAdminAccessOperations>;\n  private readonly boundary:').replace('this.boundary = composeAdminIdentityWorkflows(this.alerts);','this.boundary = composeAdminIdentityWorkflows(this.alerts); this.access = composeAdminAccessOperations(this.config, this.jwt);');assert.equal(read(controller),expected);
const changed=execFileSync('git',['diff',reference,'--name-only'],{encoding:'utf8'}).trim().split('\n');const allowedBackend=[controller,'Backend/src/auth/admin-access.engine.ts','Backend/src/identity-adapters/lot2d-boundaries.spec.ts','Backend/test/lot2d-admin-scenario.cjs','Backend/test/lot2d-identity.integration.cjs',...['application/ports/admin-access-operations.ts','application/use-cases/admin-access-operations.ts','adapters/inbound/admin-access-operations.adapter.ts','adapters/outbound/existing-admin-access-operations.ts','bootstrap/admin-access-operations.composition.ts'].map(p=>'Backend/services/identity/src/'+p)];assert(changed.filter(p=>p.startsWith('Backend/')).every(p=>allowedBackend.includes(p)));assert(!changed.some(p=>/^(Frontend|services\/identity|Backend\/(gateway|prisma))/.test(p)));
const previous=JSON.parse(fs.readFileSync('Docs/astra/evidence/lot2c-identity/review-summary.json'));
for(const item of previous.sourceManifest.filter(x=>x.file.startsWith('Backend/')&&x.file!==controller))assert.equal(sha(item.file),item.sha256,item.file);
const initial=JSON.parse(fs.readFileSync('.cache/astra-lot2d-identity/initial-integrity.json'));
for(const item of initial.evidence){assert.equal(sha(item.file),item.sha256);assert.equal(execFileSync('git',['ls-files','--',item.file],{encoding:'utf8'}).trim(),'');}
for(const commit of [reference,'a72e787deb03facf29989eab64949aec5d339950','49025813890ad426d64c4a6af6277c852d0ccc66'])execFileSync('git',['merge-base','--is-ancestor',commit,'HEAD']);
// Follow relative runtime imports only: type-only edges are erased by TypeScript.
const imports=p=>[...read(p).matchAll(/(?:import|export)\s+(?!type\b)[^;]*?\s+from\s+['"]([^'"]+)['"]/g)].filter(m=>m[1].startsWith('.')).map(m=>path.resolve(path.dirname(p),m[1])).map(p=>[p+'.ts',path.join(p,'index.ts')].find(p=>fs.existsSync(p))).filter(Boolean);
const active=new Set(),done=new Set();function walk(p){assert(!active.has(p),'Runtime import cycle: '+p);if(done.has(p))return;active.add(p);for(const next of imports(p))walk(next);active.delete(p);done.add(p);}
walk(path.resolve(controller));
const result={reference,literalEngineBodiesPreserved:true,controllerClosedTransformationPassed:true,previousBackendManifestPreservedExceptAdminController:true,historicalEvidencePreserved:true,ancestorsVerified:true,runtimeImportCycles:0,runtimeFilesVisited:done.size,trackedBackendChanges:changed.filter(p=>p.startsWith('Backend/'))};
fs.writeFileSync('.cache/astra-lot2d-identity/source-integrity.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
