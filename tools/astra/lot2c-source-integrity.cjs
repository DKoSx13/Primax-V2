// Compare every controller change against a closed transformation of the accepted reference.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
process.chdir(path.resolve(__dirname, '../..'));
const reference = 'a72e787deb03facf29989eab64949aec5d339950';
const norm = text => text.replaceAll('\r\n', '\n').trim();
const old = file => norm(execFileSync('git', ['show', reference + ':' + file], { encoding: 'utf8' }));
const read = file => norm(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const controllers = ['Backend/src/auth/auth.controller.ts', 'Backend/src/kiosk/kiosk.controller.ts', 'Backend/src/auth/admin.controller.ts'];
let auth = old(controllers[0]);
auth = "import { composeIdentitySecurityOperations } from '../../services/identity/src/bootstrap/identity-security-operations.composition';\n" + auth;
auth = auth.replace('export class AuthController {', 'export class AuthController {\n  private readonly boundary: ReturnType<typeof composeIdentitySecurityOperations>;')
  .replace('  ) {}', '  ) { this.boundary = composeIdentitySecurityOperations(this.service, this.resetService); }')
  .replaceAll('return this.resetService.', 'return this.boundary.').replaceAll('return this.service.', 'return this.boundary.');
assert.equal(read(controllers[0]), auth);
let kiosk = old(controllers[1]);
kiosk = "import { composeKioskSessionOperations } from '../../services/identity/src/bootstrap/kiosk-session-operations.composition';\n" + kiosk;
kiosk = kiosk.replace('export class KioskController {', 'export class KioskController {\n  private readonly boundary: ReturnType<typeof composeKioskSessionOperations>;')
  .replace('constructor(private readonly service: KioskService) {}', 'constructor(private readonly service: KioskService) { this.boundary = composeKioskSessionOperations(this.service); }')
  .replaceAll('this.service.', 'this.boundary.');
assert.equal(read(controllers[1]), kiosk);
let admin = old(controllers[2]);
admin = "import { composeAdminIdentityWorkflows } from '../../services/identity/src/bootstrap/admin-identity-workflows.composition';\n" + admin;
admin = admin.replace('export class AdminController {', 'export class AdminController {\n  private readonly boundary: ReturnType<typeof composeAdminIdentityWorkflows>;')
  .replace('  ) {}', '  ) { this.boundary = composeAdminIdentityWorkflows(this.alerts); }')
  .replaceAll('this.alerts.', 'this.boundary.');
assert.equal(read(controllers[2]), admin);
const previous = JSON.parse(fs.readFileSync('Docs/astra/evidence/lot2b-composition/review-summary.json'));
for (const entry of previous.sourceManifest.filter(entry => entry.file.startsWith('Backend/') && !controllers.includes(entry.file))) assert.equal(sha(entry.file), entry.sha256, entry.file);
const initial = JSON.parse(fs.readFileSync('.cache/astra-lot2c-identity/initial-integrity.json'));
for (const entry of initial.evidence) {
  assert.equal(sha(entry.file), entry.sha256);
  assert.equal(execFileSync('git', ['ls-files', '--', entry.file], { encoding: 'utf8' }).trim(), '');
}
const changedBackend = execFileSync('git', ['diff', reference, '--name-only', '--', 'Backend'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const families = ['identity-security-operations', 'kiosk-session-operations', 'admin-identity-workflows'];
const identityRoot = 'Backend/services/identity/src/';
const layers = ['application/ports/', 'application/use-cases/', 'adapters/inbound/', 'adapters/outbound/', 'bootstrap/'];
const inventory = families.flatMap(family => layers.map((layer, i) => identityRoot + layer + (i === 3 ? 'existing-' : '') + family + (i === 2 ? '.adapter' : i === 4 ? '.composition' : '') + '.ts'));
assert(inventory.every(file => fs.existsSync(file)));
assert(changedBackend.every(file => controllers.includes(file) || inventory.includes(file) || ['Backend/src/identity-adapters/lot2c-boundaries.spec.ts','Backend/test/lot2c-identity.integration.cjs','Backend/test/lot2c-kiosk-scenario.cjs'].includes(file)), 'Unexpected backend change');
const imports = file => [...fs.readFileSync(file, 'utf8').matchAll(/(?:import|export)\s+[^;]*?\s+from\s+['"]([^'"]+)['"]/g)]
  .filter(match => match[1].startsWith('.')).map(match => path.resolve(path.dirname(file), match[1]))
  .map(target => [target + '.ts', path.join(target, 'index.ts')].find(candidate => fs.existsSync(candidate))).filter(Boolean);
const reaches = (from, target, seen = new Set()) => {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from); return imports(from).some(next => reaches(next, target, seen));
};
for (const [i, family] of families.entries()) assert(!reaches(path.resolve(identityRoot, 'bootstrap', family + '.composition.ts'), path.resolve(controllers[i])), 'New controller composition cycle');
const result = { reference, initial, originalControllerDecoratorsDtosAndPoliciesPreserved: true,
  adminLoginAndDemoBodiesUnchanged: true, authCoreCompositionAndGuardUnchanged: true,
  newCompositionCycles: 0, newBoundaryFiles: inventory.map(file => ({ file, sha256: sha(file) })),
  allOtherTrackedBackendFilesUnchanged: true, historicalEvidencePreservedAndExcluded: true };
fs.writeFileSync('.cache/astra-lot2c-identity/source-integrity.json', JSON.stringify(result, null, 2));
console.log('Fifteen boundaries inventoried; controllers, engines, policies, 2B composition and evidence preserved');
