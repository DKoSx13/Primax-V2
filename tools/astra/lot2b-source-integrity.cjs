// Structural/policy checks against the accepted reference, without executing engines.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
process.chdir(repo);
const reference = '49025813890ad426d64c4a6af6277c852d0ccc66';
const normalize = s => s.replaceAll('\r\n', '\n').trim();
const read = file => normalize(fs.readFileSync(file, 'utf8'));
const old = file => normalize(execFileSync('git', ['show', reference + ':' + file], { encoding: 'utf8' }));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const originalModule = old('Backend/src/auth/auth.module.ts');
const originalCore = originalModule.slice(0, originalModule.indexOf('export class AuthCoreModule {}') + 'export class AuthCoreModule {}'.length)
  .replace(/^import \{ (KioskController|AuthController|AdminController) \}[^\n]*\n/gm, '');
assert.equal(read('Backend/src/auth/auth-core.module.ts'), originalCore);
const helper = /export function demoAdminEnabled\(config: ConfigService\) \{[^]*?\n\}/;
const originalAdmin = old('Backend/src/auth/admin.controller.ts');
const movedHelper = originalAdmin.match(helper)[0];
assert.equal(read('Backend/src/auth/demo-admin-enabled.ts'), "import { ConfigService } from '@nestjs/config';\n\n" + movedHelper);
assert.equal(read('Backend/src/auth/admin.controller.ts'), "import { demoAdminEnabled } from './demo-admin-enabled';\n" + originalAdmin.replace(helper, "export { demoAdminEnabled } from './demo-admin-enabled';"));
assert.equal(read('Backend/src/auth/access.guard.ts'), old('Backend/src/auth/access.guard.ts').replace("from './admin.controller'", "from './demo-admin-enabled'"));
for (const file of ['Backend/src/apps/bootstrap.ts', 'Backend/src/operations/operations.module.ts'])
  assert.equal(read(file), old(file).replace("../auth/auth.module'", "../auth/auth-core.module'"));
const root = path.resolve('Backend');
const graph = new Map();
function imports(file) {
  if (graph.has(file)) return graph.get(file);
  const edges = [];
  graph.set(file, edges);
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:import|export)\s+[^;]*?\s+from\s+['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), match[1]);
    const resolved = [target + '.ts', path.join(target, 'index.ts')].find(p => fs.existsSync(p));
    if (resolved) edges.push(resolved);
  }
  return edges;
}
function reaches(from, to, seen = new Set()) {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return imports(from).some(next => reaches(next, to, seen));
}
const newEdges = [
  ['src/apps/bootstrap.ts', 'src/auth/auth-core.module.ts'],
  ['src/operations/operations.module.ts', 'src/auth/auth-core.module.ts'],
  ['src/auth/auth.module.ts', 'src/auth/auth-core.module.ts'],
  ['src/auth/access.guard.ts', 'src/auth/demo-admin-enabled.ts'],
  ['src/auth/admin.controller.ts', 'src/auth/demo-admin-enabled.ts'],
];
for (const [from, to] of newEdges) assert(!reaches(path.join(root, to), path.join(root, from)), 'New composition cycle: ' + from);
const previous = JSON.parse(fs.readFileSync('Docs/astra/evidence/lot2-identity/review-summary.json'));
const protectedFiles = Object.entries(previous.protectedSourceHashes).filter(([file]) => !['Backend/src/auth/admin.controller.ts', 'Backend/src/auth/access.guard.ts', 'Backend/src/auth/auth.module.ts', 'Backend/src/apps/bootstrap.ts', 'Backend/src/operations/operations.module.ts'].includes(file));
for (const [file, hash] of protectedFiles) assert.equal(sha(file), hash, file);
for (const item of previous.preservedOriginalEvidence) assert.equal(sha(item.file), item.sha256, item.file);
const initial = JSON.parse(fs.readFileSync('.cache/astra-lot2b-composition/initial-integrity.json'));
assert.equal(initial.head, reference);
assert.equal(initial.branch, 'feat/dezkz-identity-a4-core');
for (const hash of [...initial.ancestors, reference]) execFileSync('git', ['merge-base', '--is-ancestor', hash, 'HEAD']);
for (const item of initial.evidence) assert.equal(sha(item.file), item.sha256);
const result = { reference, exactCoreMetadataAndJwtCompositionPreserved: true, exactHelperBodyPreserved: true,
  guardChanges: 'import only', controllerMethodsAndDecoratorsUnchanged: true,
  newCompositionEdgesCycleFree: newEdges, protectedPriorHashesVerified: protectedFiles.length,
  initial, historicalEvidenceStillUntracked: initial.evidence.every(item => {
    try { execFileSync('git', ['ls-files', '--error-unmatch', item.file], { stdio: 'ignore' }); return false; } catch { return true; }
  }) };
assert(result.historicalEvidenceStillUntracked);
fs.writeFileSync('.cache/astra-lot2b-composition/source-integrity.json', JSON.stringify(result, null, 2));
console.log('Composition, unchanged policies, cycle checks, ancestry and nine historical evidences verified');
