// Equivalent to a fresh checkout of the pending change, including new source files.
// Does not stage, commit, push, reset Git, or delete any data/volumes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'primax-clean-'));
const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
for (const file of files) {
  const source = path.resolve(root, file), target = path.resolve(destination, file);
  if (!source.startsWith(root + path.sep) || !target.startsWith(destination + path.sep)) throw Error('Invalid checkout path');
  if (!fs.existsSync(source)) continue; // tracked deletion
  if (fs.lstatSync(source).isSymbolicLink()) throw Error('Review symlink before clean validation: ' + file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
if (fs.existsSync(path.join(destination, '.env')) || fs.existsSync(path.join(destination, 'Backend/node_modules'))) throw Error('Local files leaked into clean copy');
const env = { ...process.env, COMPOSE_PROJECT_NAME: process.env.CLEAN_PROJECT_NAME || 'primax-clean-validation',
  FRONTEND1_PORT: '26181', FRONTEND2_PORT: '26182', FRONTEND3_PORT: '26183', BACKEND_PORT: '26100' };
console.log(JSON.stringify({ cleanDirectory: destination, sourceFiles: files.length, project: env.COMPOSE_PROJECT_NAME }));
for (const args of [['compose','config','--quiet'], ['compose','build','--no-cache'], ['compose','up','-d','--wait','--wait-timeout','180']]) {
  const result = spawnSync('docker', args, { cwd: destination, env, stdio: 'inherit' });
  if (result.status !== 0) { process.exitCode = result.status || 1; break; }
}
console.log('Clean copy retained for review: ' + destination);
