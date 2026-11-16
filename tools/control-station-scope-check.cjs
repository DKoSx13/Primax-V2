// Read-only cached tool image, no network/database, source copy only in new tmpfs.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomBytes, createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const mode = process.argv[2] || "after";
assert.ok(["before", "after", "backend"].includes(mode)); assert.ok(process.argv.length <= 3);
const tag = randomBytes(10).toString("hex"), image = "primax-v2-backend-test:latest";
const evidence = path.join(root, "Docs/astra/evidence", `control-station-scope-${mode}-${tag}.json`);
assert.equal(fs.existsSync(evidence), false);
const worker = String.raw`
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const mode=process.argv[1],source='/workspace/Backend';
const project=fs.mkdtempSync('/tmp/control-scope-');
for(const name of ['src','test','tsconfig.json','tsconfig.build.json','jest.config.cjs','package.json'])
  fs.cpSync(path.join(source,name),path.join(project,name),{recursive:true,errorOnExist:true,force:false});
fs.symlinkSync('/app/node_modules',path.join(project,'node_modules'),'dir');
const env={...process.env,DATABASE_URL:'postgresql://invalid:invalid@127.0.0.1:1/never_connect',DATABASE_URL_UNPOOLED:'postgresql://invalid:invalid@127.0.0.1:1/never_connect',PRISMA_GENERATE_SKIP_AUTOINSTALL:'true',CHECKPOINT_DISABLE:'1'};
// Cached client predates this schema. Generate only into fresh tmpfs, offline;
// schema models remain byte-identical; only this copy's generator output changes.
const generated=path.join(project,'generated-control-client');
const schema=fs.readFileSync(path.join(source,'prisma/schema.prisma'),'utf8').replace(/generator client\s*\{/, 'generator client {\n  output = '+JSON.stringify(generated));
const schemaFile=path.join(project,'control-test.prisma');fs.writeFileSync(schemaFile,schema,{flag:'wx'});
cp.execFileSync(process.execPath,['/app/node_modules/prisma/build/index.js','generate','--schema',schemaFile],{cwd:project,env,stdio:'pipe',timeout:30000});
const config=require(path.join(project,'jest.config.cjs'));
config.moduleNameMapper={...config.moduleNameMapper,'^@prisma/client$':generated};
config.transform={'^.+\\.tsx?$':['/app/node_modules/ts-jest',{tsconfig:{...JSON.parse(fs.readFileSync(path.join(project,'tsconfig.json'),'utf8')).compilerOptions,baseUrl:project,paths:{'@prisma/client':['./generated-control-client']}}}]};
const configFile=path.join(project,'scope-jest.config.cjs');fs.writeFileSync(configFile,'module.exports='+JSON.stringify(config),{flag:'wx'});
const report=path.join(project,'result.json');
const args=['/app/node_modules/jest/bin/jest.js','--config',configFile,'--runInBand','--no-cache','--json','--outputFile',report];
if(mode==='before') args.push('--runTestsByPath',path.join(project,'src/control/control-customers-scope.spec.ts'));
else if(mode==='after') args.push('src/control/');
const run=cp.spawnSync(process.execPath,args,{cwd:project,env,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
const data=fs.existsSync(report)?JSON.parse(fs.readFileSync(report,'utf8')):null;
const failures=data?data.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>({name:t.fullName,messages:t.failureMessages.map(m=>m.replace(/\u001b\[[0-9;]*m/g,'').slice(0,1800))}))):[];
console.log(JSON.stringify({success:run.status===0,status:run.status,mode,node:process.version,typescript:require('/app/node_modules/typescript').version,
tests:data?{total:data.numTotalTests,passed:data.numPassedTests,failed:data.numFailedTests,pending:data.numPendingTests,suites:data.numTotalTestSuites}:null,generatedClientInTmpfs:true,
failures,suiteErrors:data?data.testResults.filter(s=>s.status==='failed'&&!s.assertionResults.length).map(s=>String(s.message).slice(0,3000)):[],
toolFailure:!data?String(run.stderr||run.error||'missing Jest report').slice(-3000):undefined}));
`;
const run = execFileSync("docker", ["run", "--rm", "--pull", "never", "--network", "none", "--name", "control-scope-" + tag,
  "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=384m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--mount", `type=bind,source=${root},target=/workspace,readonly`, "--entrypoint", "node", image, "-e", worker, mode],
  { cwd: root, encoding: "utf8", timeout: 150000, stdio: ["ignore", "pipe", "pipe"] });
const result = JSON.parse(run.trim());
result.serviceSha256 = createHash("sha256").update(fs.readFileSync(path.join(root,"Backend/src/control/control-customers.service.ts"))).digest("hex");
result.isolation = { network: "none", readOnlySources: true, newTmpfs: true, databaseUsed: false, dependencyInstall: false };
fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ success: result.success, tests: result.tests, evidence: path.relative(root,evidence), suiteErrors: result.suiteErrors, toolFailure: result.toolFailure }, null, 2));
if (!result.success) process.exitCode = 1;
