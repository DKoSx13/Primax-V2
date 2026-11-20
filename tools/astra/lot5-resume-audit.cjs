// Offline recovery audit. Reads saved evidence; never starts Docker or applications.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
process.chdir(path.resolve(__dirname, '../..'));
const dest = 'Docs/astra/evidence/lot5-validation';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git = args => cp.execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
const initial = read('.cache/astra-lot5/initial-integrity.json');
const publicBefore = fs.readdirSync(dest).filter(f => f !== 'resume-audit.json').map(f => ({ file: dest + '/' + f, sha256: sha(dest + '/' + f) }));
assert.equal(git(['rev-parse', initial.head]), '9d57edea9bf047ac8e5d05833ec752bb82572591');
assert.equal(git(['branch', '--show-current']), 'feat/dezkz-identity-a4-core');
git(['merge-base', '--is-ancestor', initial.head, 'HEAD']);
const changed = initial.trackedManifest.filter(r => sha(r.file) !== r.sha256).map(r => r.file);
assert(changed.every(p => p === 'Docs/astra/primax-stage3j-definitive-hexagonal-closure-plan.md'), 'Protected tracked source changed');
for (const e of initial.evidence) {
  assert.equal(sha(e.file), e.sha256, e.file);
  assert.equal(git(['ls-files', '--', e.file]), '', 'Historical evidence must remain untracked');
}
const rawFiles = new Set();
function raw(p) { rawFiles.add(p); return read(p); }
function samePublic(name, source) { assert.deepEqual(read(dest + '/' + name), raw(source), name); }
const offline = '.cache/astra-lot5-offline/run-01fb7d191352';
samePublic('backend-tests.json', offline + '/results.json');
samePublic('client-tests.json', '.cache/astra-lot5-clients/run-e4133e8dd9/results.json');
samePublic('browser-checks.json', '.cache/astra-lot5/browser-final.json');
samePublic('http-security.json', '.cache/astra-lot5/http-security.json');
const originalLifecycle = raw('.cache/astra-lot5/lifecycle-results.json');
const sanitizedLifecycle = structuredClone(originalLifecycle);
const redisCommand = sanitizedLifecycle.inventory.find(c=>c.service==='redis').command;
const redisPasswordIndex = redisCommand.indexOf('--requirepass')+1;
assert(redisPasswordIndex>0);
assert.equal(redisCommand[redisPasswordIndex], read('.cache/astra-lot5/lab-private.json').env.REDIS_PASSWORD);
redisCommand[redisPasswordIndex]='<redacted:REDIS_PASSWORD>';
assert.deepEqual(read(dest+'/persistence-inventory.json'),sanitizedLifecycle);
const jest = raw(offline + '/jest-results.json');
assert(jest.success); assert.equal(jest.numTotalTestSuites, 60);
assert.equal(jest.numPassedTests, 576); assert.equal(jest.numFailedTests, 0);
assert.equal(jest.testResults.length, 60);
assert(jest.testResults.every(s => s.status === 'passed'));
for (const r of read(dest + '/backend-tests.json').results) {
  assert.equal(r.exitCode, 0); assert(fs.existsSync(offline + '/' + r.log)); rawFiles.add(offline + '/' + r.log);
}
function tap(p, count) {
  const s = fs.readFileSync(p, 'utf8'); rawFiles.add(p);
  assert(new RegExp('# pass ' + count + '(?:\\r?\\n|$)').test(s), p);
  assert(/# fail 0(?:\r?\n|$)/.test(s), p);
}
for (const [f,n] of [['compose-init-safety',8],['gateway-contracts',24],['packaging-contracts',9]]) tap(offline + '/' + f + '.log', n);
for (const c of read(dest + '/client-tests.json')) {
  assert.equal(c.exitCode,0); assert.equal(c.failed,0);
  tap('.cache/astra-lot5-clients/run-e4133e8dd9/' + c.app + '.log', c.passed);
}
const ocr = '.cache/astra-lot5/ocr-tests.log'; rawFiles.add(ocr);
assert(/Ran 12 tests[\s\S]*\bOK\b/.test(fs.readFileSync(ocr,'utf8')));
assert.equal(sha(ocr), sha(dest + '/ocr-tests.log'));
const pairs = read(dest + '/paired-families.json'); assert.equal(pairs.length,22);
let snapshotSourceChecks = 0;
const sourceLineEndingDifferences = [];
const backendSources = initial.trackedManifest.filter(r => r.file.startsWith('Backend/') && !r.file.split('/').some(p => ['node_modules','dist','build','.cache'].includes(p) || p.startsWith('.env')));
for (const p of pairs) {
  assert(p.exactCanonicalComparisonPassed);
  assert.deepEqual(p.comparison, raw(p.candidate + '/comparison-results.json'));
  const arms = [];
  for (const arm of ['baseline','candidate']) {
    assert.deepEqual(p[arm + 'Results'], raw(p[arm] + '/integration-results.json'));
    const canonical = raw(p[arm] + '/comparison-data.json');
    assert.equal(canonical.checks.length, p.checksPerArm);
    for (const r of canonical.responses) if (r.label.startsWith('concurrent ')) r.label = 'concurrent';
    canonical.responses.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    arms.push(canonical);
    const isolation = raw(p[arm] + '/isolation.json');
    assert(isolation.newVolumesVerifiedEmpty && isolation.volumeOwned && isolation.expectedMountVerified && isolation.internalNetwork);
    assert.equal(isolation.publishedPorts,0);
    assert(raw(p[arm] + '/final-states.json').every(s => s.running === false));
    // Compare the saved source snapshots to the unchanged accepted Backend inputs.
    for (const r of backendSources) {
      const file = p[arm] + '/source-backend/' + r.file.slice('Backend/'.length);
      if (sha(file) !== r.sha256) {
        assert.equal(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'), fs.readFileSync(r.file,'utf8').replace(/\r\n/g,'\n'), file);
        sourceLineEndingDifferences.push(file);
      }
      snapshotSourceChecks++;
    }
  }
  assert.deepEqual(arms[1], arms[0], p.family + ' canonical parity');
}
assert.equal(pairs.reduce((n,p) => n + p.checksPerArm * 2, 0),2570);
const rows = read(dest + '/contracts-115.json');
assert.equal(rows.length,115); assert.equal(new Set(rows.map(r => r.contract)).size,115);
const inventory = read('Docs/astra/primax-stage1-public-contract-inventory.json');
const gateway = require('../../Backend/gateway/routes.cjs');
for (const [service,n] of Object.entries({identity:26,catalog:6,administration:37,commerce:46})) assert.equal(rows.filter(r => r.service === service).length,n);
for (const r of rows) {
  assert.equal(gateway.serviceFor(r.contract.split(' ')[1]),r.service);
  assert(fs.existsSync(r.portFile)); assert(r.adapterFiles.length > 0);
  r.adapterFiles.forEach(f => assert(fs.existsSync(f)));
  assert(inventory.routes.some(i => i.method + ' ' + i.path === r.contract),r.contract);
  assert(pairs.some(p => p.family === r.lot5EvidenceFamily),r.contract);
}
const trace = read(dest+'/contracts-115-traceability.json');
assert.equal(trace.length,115);
for (const r of rows) {
  const t=trace.find(t=>t.contract===r.contract);
  for (const [k,v] of Object.entries(r)) assert.deepEqual(t[k],v,r.contract+' '+k);
  assert(t.authorizationMetadata && t.writer && t.consistencyReference && t.testEvidence);
}
const markdownMatrix=fs.readFileSync('Docs/astra/primax-lot5-contracts-115.md','utf8');
assert.equal(markdownMatrix.split(/\r?\n/).filter(l=>/^\| \d+ \|/.test(l)).length,115);
for (const r of rows) assert(markdownMatrix.includes('| '+r.contract+' |'));
const docFiles=fs.readdirSync('Docs/astra').filter(f=>f.startsWith('primax-lot5-')&&f.endsWith('.md')).map(f=>'Docs/astra/'+f);
let checkedDocumentLinks=0;
for (const file of docFiles) {
  const content=fs.readFileSync(file,'utf8');
  for (const m of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const link=m[1].split('#')[0]; if(!link||/^(https?:|mailto:)/.test(link))continue;
    assert(fs.existsSync(path.resolve(path.dirname(file),link)),file+' -> '+link); checkedDocumentLinks++;
  }
}
// Match private synthetic keys without printing them or serializing private config.
const secretKeys=['JWT_SECRET','KIOSK_API_KEY','KIOSK_GATEWAY_SECRET','OCR_SERVICE_SECRET','POSTGRES_PASSWORD','REDIS_PASSWORD'];
const privateLabs=['.cache/astra-lot5/lab-private.json','.cache/astra-lot5/failed-recovery-lab-private.json'];
const secrets=[...new Set(privateLabs.flatMap(f=>{const env=read(f).env;return secretKeys.map(k=>env[k]).filter(v=>typeof v==='string'&&v.length>=16);} ))];
const publicTextFiles=[...docFiles,'Docs/astra/primax-stage3j-definitive-hexagonal-closure-plan.md',...fs.readdirSync(dest).filter(f=>/\.(json|log)$/.test(f)).map(f=>dest+'/'+f),...fs.readdirSync('tools/astra').filter(f=>/^lot5-.*\.cjs$/.test(f)).map(f=>'tools/astra/'+f)];
for(const file of publicTextFiles) {
  const content=fs.readFileSync(file,'utf8');
  for(const secret of secrets)assert(!content.includes(secret),'Private key found in '+file);
  assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content),'Private key block in '+file);
  assert(!/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/.test(content),'Complete JWT-shaped value in '+file);
}
for (const p of read(dest + '/screenshots.json')) assert.equal(sha(dest + '/' + p.file),p.sha256);
const lifecycle = read(dest + '/persistence-inventory.json');
assert(lifecycle.databaseExactAfterRestart && lifecycle.printExactAfterRestart);
assert.equal(lifecycle.healthy,15); assert.equal(lifecycle.jobsExit0,2);
assert.equal(lifecycle.postgres.migrations,36); assert.equal(lifecycle.postgres.tables,41);
assert.equal(lifecycle.postgres.unvalidatedForeignKeys,0);
const dump = '.cache/astra-lot5/synthetic-backup.dump';
assert.equal(sha(dump),lifecycle.backup.sha256); assert.equal(fs.statSync(dump).size,lifecycle.backup.bytes);
const browser = read(dest + '/browser-checks.json');
assert.equal(browser.checks.filter(c => c.pass).length,15); assert.equal(browser.checks.filter(c => !c.pass).length,1);
assert(read(dest + '/http-security.json').checks.every(c => c.pass));
const fsck = cp.spawnSync('git',['fsck','--connectivity-only'],{encoding:'utf8',windowsHide:true}); assert.equal(fsck.status,0);
const docker = cp.spawnSync('docker',['version','--format','{{.Server.Version}}'],{encoding:'utf8',windowsHide:true,timeout:10000});
const result = {
  auditedAt: new Date().toISOString(), reference: initial.head, head: git(['rev-parse','HEAD']),
  kind: 'OFFLINE_AUDIT_OF_PREVIOUS_EXECUTIONS_NOT_NEW_FUNCTIONAL_TESTS',
  passed: true, unchangedTrackedFiles: initial.trackedManifest.length - changed.length, allowedDocumentChanges: changed,
  historicalEvidence: initial.evidence, historicalEvidenceStillUntracked: true,
  originalIntegrityManifestSha256:sha('.cache/astra-lot5/initial-integrity.json'),
  pairedFamiliesRecompared:22, backendSnapshotFileHashChecks:snapshotSourceChecks,
  sourceComparisonRule:'Exact bytes, except recorded CRLF/LF-only differences in git-show baseline copies',
  sourceLineEndingDifferences,
  rawArtifacts: [...rawFiles].sort().map(file => ({file,sha256:sha(file)})),
  preservedPublicEvidence: publicBefore,
  routesChecked:115, screenshotsChecked:read(dest+'/screenshots.json').length,
  extendedTraceabilityChecked:115, checkedDocumentLinks,
  publicSecretScan:{files:publicTextFiles.length,distinctPrivateKeysChecked:secrets.length,exactMatches:0,privateKeyBlocks:0},
  evidenceSanitization:{file:'persistence-inventory.json',field:'inventory[service=redis].command[after --requirepass]',replacement:'<redacted:REDIS_PASSWORD>',privateOriginalRetained:true,otherFieldsExact:true},
  reusedFunctionalResults: read(dest+'/test-totals.json'), fsckExit:fsck.status,
  currentDockerAvailable: docker.status === 0,
  currentProtectedContainerState: 'NOT_REVALIDATED; saved integrity.json describes previous session only',
  blockers: ['T02 recovery functional test failed on unchanged reference', 'Native Linux and macOS host protocol required by 3J not executed'],
  lot5Complete:false, academicClosureAccepted:false
};
fs.writeFileSync(dest+'/resume-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,sourceHashes:snapshotSourceChecks,pairedFamilies:22,routes:115,currentDockerAvailable:result.currentDockerAvailable,lot5Complete:false},null,2));
