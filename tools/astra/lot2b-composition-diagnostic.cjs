// Offline COPY-scope comparison. Probes modify disposable copies, never controllers in the repository.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const reference = '49025813890ad426d64c4a6af6277c852d0ccc66';
const composition = ['auth/auth.module.ts', 'apps/bootstrap.ts', 'operations/operations.module.ts', 'auth/access.guard.ts', 'auth/admin.controller.ts'];
const domains = ['identity', 'catalog', 'administration', 'commerce', 'legacy'];
if (process.argv[2] === '--inside') {
  const results = [];
  for (const arm of ['baseline', 'candidate']) for (const domain of domains) {
    const root = '/tmp/' + arm + '-' + domain;
    fs.cpSync('/source', root, { recursive: true, filter: p => {
      const parts = path.relative('/source', p).split(path.sep);
      return !parts.some(x => ['node_modules', 'dist', 'build', '.cache', 'coverage'].includes(x) || x.startsWith('.env')) &&
        !(domain !== 'legacy' && parts[0] === 'services' && parts[1] && parts[1] !== domain);
    } });
    fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
    if (arm === 'baseline') for (const source of composition)
      fs.copyFileSync('/reference/' + source, root + '/src/' + source);
    const run = probe => {
      const args = domain === 'legacy' ? ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'] : ['scripts/build-domain.cjs', domain];
      const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
      const name = `${arm}-${domain}-${probe ? 'probe' : 'original'}`;
      const log = (r.stdout || '') + (r.stderr || '');
      fs.writeFileSync('/evidence/' + name + '.log', log);
      const expectedFailure = arm === 'baseline' && probe && !['identity', 'legacy'].includes(domain);
      if (expectedFailure) { assert.notEqual(r.status, 0); assert.match(log, /TS2307/); }
      else assert.equal(r.status, 0, name + ': ' + log);
      let files;
      if (!expectedFailure && domain !== 'legacy') {
        const manifest = JSON.parse(fs.readFileSync(`${root}/services/${domain}/dist/build-manifest.json`));
        fs.writeFileSync('/evidence/' + name + '-manifest.json', JSON.stringify(manifest, null, 2));
        files = Object.keys(manifest.files);
        if (arm === 'candidate' && domain !== 'identity') {
          assert(!files.some(f => /services\/identity\//.test(f)), 'Foreign Identity source emitted');
          assert(!files.some(f => /src\/(auth\/(auth|admin)\.controller|kiosk\/kiosk\.controller|auth\/auth\.module)\.js$/.test(f)), 'HTTP facade leaked into core consumer');
        }
      }
      results.push({ arm, domain, probe, exit: r.status, expectedFailure, files: files?.length, log: name + '.log' });
      console.log(name + ': verified');
    };
    run(false);
    for (const [file, useCase] of [['auth/auth.controller.ts', 'profile-operations'], ['auth/admin.controller.ts', 'vehicle-linking'], ['kiosk/kiosk.controller.ts', 'plate-recognition']]) {
      const target = root + '/src/' + file;
      fs.writeFileSync(target, `import type * as CompositionProbe from '../../services/identity/src/application/use-cases/${useCase}';\n` + fs.readFileSync(target, 'utf8'));
    }
    run(true);
  }
  fs.writeFileSync('/evidence/results.json', JSON.stringify({ reference, network: 'none', databaseCommands: 0, repositoryControllerEdits: 0, results }, null, 2));
} else {
  const repo = path.resolve(__dirname, '../..');
  const dir = path.join(repo, '.cache/astra-lot2b-composition/diagnostic-' + crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  for (const source of composition) {
    const target = path.join(dir, 'reference', source); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, spawnSync('git', ['show', reference + ':Backend/src/' + source], { cwd: repo, encoding: 'utf8', windowsHide: true }).stdout);
  }
  const r = spawnSync('docker', ['run', '--rm', '--network', 'none',
    '--mount', `type=bind,source=${path.join(repo, 'Backend')},target=/source,readonly`,
    '--mount', `type=bind,source=${path.join(dir, 'reference')},target=/reference,readonly`,
    '--mount', `type=bind,source=${__filename},target=/diagnostic.cjs,readonly`,
    '--mount', `type=bind,source=${dir},target=/evidence`,
    '--entrypoint', 'node', 'primax-astra-stage2-validation:test', '/diagnostic.cjs', '--inside'], { stdio: 'inherit', windowsHide: true });
  console.log('Evidence: ' + path.relative(repo, dir));
  if (r.status !== 0) process.exitCode = 1;
}
