// Private, offline validation only. Never starts applications or database jobs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function inside(baseline = false) {
  const root = '/tmp/primax-lot1d-orders-backend';
  fs.cpSync('/source', root, {
    recursive: true,
    filter: source => !path.relative('/source', source).split(path.sep).some(part =>
      ['node_modules', 'dist', 'build', '.cache', '.git', 'coverage'].includes(part) ||
      part.startsWith('.env')),
  });
  fs.symlinkSync('/app/node_modules', path.join(root, 'node_modules'), 'dir');
  const results = [];
  function run(name, args) {
    const started = Date.now();
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', shell: false });
    const log = `${name}.log`;
    fs.writeFileSync('/evidence/' + log, (result.stdout || '') + (result.stderr || ''));
    results.push({ name, exitCode: result.status, elapsedMs: Date.now() - started, log });
    console.log(`${name}: exit ${result.status}`);
    if (result.error || result.status !== 0) throw new Error('Validation failed: ' + name);
  }
  try {
    run('commerce-contracts', ['/app/node_modules/jest/bin/jest.js', '--runInBand', '--config', 'jest.config.cjs',
      '--json', '--outputFile=/evidence/jest-results.json', '--runTestsByPath',
      'src/transactions/transaction-read.spec.ts',
      'src/transactions/transaction-create.spec.ts',
      'src/transactions/authorization-commands.spec.ts',
      'src/payments/payment-workflow.spec.ts',
      ...(baseline ? [] : ['src/payments/order-workflow.spec.ts']),
      'src/payments/payment-provider.spec.ts', 'src/payments/online-orders.reselect.spec.ts',
      'src/transactions/transactions.service.spec.ts',
      'src/transactions/critical-integrity.spec.ts',
      'src/transactions/authorizations.service.spec.ts', 'src/payments/payments.service.spec.ts',
      'src/kiosk/kiosk.spec.ts', 'src/kiosk/kiosk-http.spec.ts',
      'src/kiosk/terminal-recovery-access.spec.ts']);
    run('gateway-contracts', ['--test', 'gateway/routes.test.cjs']);
    run('packaging-contracts', ['--test', 'scripts/build-domain.test.cjs']);
    if (!baseline) {
      for (const service of ['catalog', 'identity', 'administration', 'commerce']) {
        run('build-' + service, ['scripts/build-domain.cjs', service]);
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'services', service, 'dist', 'build-manifest.json')));
        fs.writeFileSync(`/evidence/build-${service}.json`, JSON.stringify(manifest, null, 2) + '\n');
      }
      // Preserve the old monolithic compilation as a transition fallback.
      run('build-legacy', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json']);
    }
    const jest = JSON.parse(fs.readFileSync('/evidence/jest-results.json'));
    fs.writeFileSync('/evidence/results.json', JSON.stringify({
      node: process.version, baseline, network: 'none', dataVolumes: 0, databaseCommands: 0,
      tests: { suites: jest.numTotalTestSuites, passed: jest.numPassedTests, failed: jest.numFailedTests }, results,
    }, null, 2) + '\n');
  } catch (error) {
    fs.writeFileSync('/evidence/failed-results.json', JSON.stringify({ results }, null, 2) + '\n');
    throw error;
  }
}

function validate(baseline = false) {
  const repo = path.resolve(__dirname, '../..');
  const runId = 'run-' + crypto.randomBytes(6).toString('hex');
  const evidence = path.join(repo, '.cache', 'astra-lot1d-orders', runId);
  fs.mkdirSync(evidence, { recursive: true });
  const args = ['run', '--rm', '--network', 'none',
    '--label', 'io.primax.validation=lot1d-orders',
    '--mount', `type=bind,source=${path.join(repo, 'Backend')},target=/source,readonly`,
    '--mount', `type=bind,source=${__filename},target=/validation.cjs,readonly`,
    '--mount', `type=bind,source=${evidence},target=/evidence`,
    '--entrypoint', 'node', 'primax-astra-stage2-validation:test', '/validation.cjs', baseline ? '--inside-baseline' : '--inside'];
  console.log('Evidence: .cache/astra-lot1d-orders/' + runId);
  const result = spawnSync('docker', args, { cwd: repo, stdio: 'inherit', shell: false, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Offline Lote 1D validation failed; inspect private logs');
}

if (require.main === module) {
  try {
    if (process.argv.length === 3 && ['--inside', '--inside-baseline'].includes(process.argv[2]) && process.platform === 'linux') inside(process.argv[2] === '--inside-baseline');
    else if (process.argv.length === 2) validate();
    else if (process.argv.length === 3 && process.argv[2] === '--baseline') validate(true);
    else throw new Error('Usage: node tools/astra/lot1d-orders-validation.cjs');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
