// Fresh offline baseline/candidate builds with each existing Dockerfile's source scope.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const reference = 'd1aa04072f3f71d72f9313e03066c3a663738f56';
const controllers = ['control/control.controller.ts','control/control-operations.controller.ts','control/control-customers.controller.ts','inventory/inventory-reconciliation.ts'];
const families = ['account-access','account-administration','administrative-supervision','operational-supervision','inventory-administration','inventory-reconciliation','administrative-transactions','control-session-transport'];
if (process.argv[2] === '--inside') {
  const results = [];
  for (const arm of ['baseline', 'candidate']) for (const domain of ['identity', 'catalog', 'administration', 'commerce', 'legacy']) {
    const root = '/tmp/lot3-' + arm + '-' + domain;
    fs.cpSync('/source', root, { recursive: true, filter: file => {
      const relative = path.relative('/source', file), parts = relative.split(path.sep);
      return !parts.some(x => ['node_modules', 'dist', 'build', '.cache', 'coverage'].includes(x) || x.startsWith('.env')) &&
        !(domain !== 'legacy' && parts[0] === 'services' && parts[1] && parts[1] !== domain) &&
        !(arm === 'baseline' && relative.startsWith('services/administration/src/') && families.some(family => path.basename(relative).includes(family)));
    } });
    fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
    if (arm === 'baseline') for (const source of controllers) fs.copyFileSync('/reference/' + source, root + '/src/' + source);
    const args = domain === 'legacy' ? ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'] : ['scripts/build-domain.cjs', domain];
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    const name = arm + '-' + domain, log = (run.stdout || '') + (run.stderr || '');
    fs.writeFileSync('/evidence/' + name + '.log', log);
    assert.equal(run.status, 0, name + ': ' + log);
    let fileCount;
    if (domain !== 'legacy') {
      const manifest = JSON.parse(fs.readFileSync(`${root}/services/${domain}/dist/build-manifest.json`));
      fs.writeFileSync('/evidence/' + name + '-manifest.json', JSON.stringify(manifest, null, 2));
      const files = Object.keys(manifest.files); fileCount = files.length;
      assert.equal(files.filter(file => /src\/apps\/[^/]+\/main\.js$/.test(file)).length, 1);
      if (domain !== 'administration') assert(!files.some(file => file.includes('services/administration/')));
      if (domain !== 'identity') assert(!files.includes('src/auth/auth.module.js'));
    }
    results.push({ arm, domain, exitCode: run.status, files: fileCount });
    console.log(name + ': passed');
  }
  fs.writeFileSync('/evidence/results.json', JSON.stringify({ reference, network: 'none', databases: 0, results }, null, 2));
} else {
  const repo = path.resolve(__dirname, '../..');
  const dir = path.join(repo, '.cache/astra-lot3-administration/context-' + crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  for (const source of controllers) {
    const run = spawnSync('git', ['show', reference + ':Backend/src/' + source], { cwd: repo, encoding: 'utf8', windowsHide: true });
    assert.equal(run.status, 0);
    const target = path.join(dir, 'reference', source); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, run.stdout);
  }
  const run = spawnSync('docker', ['run', '--rm', '--network', 'none',
    '--mount', `type=bind,source=${path.join(repo, 'Backend')},target=/source,readonly`,
    '--mount', `type=bind,source=${path.join(dir, 'reference')},target=/reference,readonly`,
    '--mount', `type=bind,source=${__filename},target=/context.cjs,readonly`,
    '--mount', `type=bind,source=${dir},target=/evidence`,
    '--entrypoint', 'node', 'primax-astra-stage2-validation:test', '/context.cjs', '--inside'], { stdio: 'inherit', windowsHide: true });
  console.log('Evidence: ' + path.relative(repo, dir));
  if (run.status !== 0) process.exitCode = 1;
}
