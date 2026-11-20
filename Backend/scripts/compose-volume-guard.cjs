// Packaging only. Refuse unknown persistent data before PostgreSQL/Redis/print start.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const project = process.env.COMPOSE_PROJECT_NAME;
assert(/^[a-z0-9][a-z0-9_-]{2,63}$/.test(project || ''), 'Invalid isolated Compose project');
assert(project !== 'primax-fuelflow-demo' && !project.includes('avance'), 'Protected project name');
const markerName = '.primax-astra-owner.json';
const purpose = 'primax-astra-original-synthetic-v1';
const roots = ['postgres', 'redis', 'print', 'bootstrap'];
// Check every volume before claiming any: a failure never blesses unknown contents.
for (const kind of roots) {
  const root = '/volumes/' + kind, marker = path.join(root, markerName);
  if (fs.existsSync(marker)) {
    const owner = JSON.parse(fs.readFileSync(marker, 'utf8'));
    assert(owner.project === project && owner.kind === kind && owner.purpose === purpose, 'Unknown volume owner: ' + kind);
    assert(!fs.lstatSync(marker).isSymbolicLink(), 'Unexpected marker symlink');
  } else assert.equal(fs.readdirSync(root).length, 0, 'Nonempty unowned volume refused: ' + kind);
}
for (const kind of roots) {
  const root = '/volumes/' + kind, marker = path.join(root, markerName);
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, JSON.stringify({ project, kind, purpose }) + '\n', { flag: 'wx', mode: 0o444 });
  if (kind === 'print' || kind === 'bootstrap') fs.chownSync(root, 1000, 1000);
}
console.log('Four isolated synthetic volume ownership checks passed; unknown volumes are refused.');
