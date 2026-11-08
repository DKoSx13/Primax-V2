// Integration fixtures use separate databases; never reset the running demo.
const { PrismaClient } = require('@prisma/client');
const { URL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { assertLocalDatabase } = require('./database-safety.cjs');
assertLocalDatabase();
if (process.env.APP_MODE !== 'local') throw Error('Local profile required');
const original = new URL(process.env.DATABASE_URL);
if (original.hostname !== 'postgres') throw Error('Use the Compose test container');
const db = new PrismaClient();
async function main() {
  for (const name of ['primax_validation', 'primax_v11_1', 'primax_v12_1b3_test', 'primax_v2_test', 'primax_control_test', 'primax_refactor_validation', 'primax_inventory_validation']) {
    // Names are a closed constant list, never supplied by external input.
    const exists = await db.$queryRaw`SELECT datname FROM pg_database WHERE datname=${name}`;
    if (!exists.length) await db.$executeRawUnsafe('CREATE DATABASE ' + name);
  }
  await db.$disconnect();
  let failed = false;
  for (const [database, args, flags = {}] of [
    ['primax_validation', ['--testPathIgnorePatterns=(incidents|partial-refund|v11_2-demo|inventory-reconciliation).e2e-spec.ts']],
    ['primax_v11_1', ['--runTestsByPath','test/incidents.e2e-spec.ts','test/partial-refund.e2e-spec.ts','test/v11_2-demo.e2e-spec.ts']],
    ['primax_v12_1b3_test', ['--runTestsByPath','test/inventory-reconciliation.e2e-spec.ts']],
    ['primax_v2_test', ['--runTestsByPath','test/v2-payments.e2e-spec.ts','test/v2-prime.e2e-spec.ts','test/assistance.e2e-spec.ts'], { V2_LOCAL_TESTS: 'true' }],
    ['primax_control_test', ['--runTestsByPath','test/control.e2e-spec.ts','test/control-operations.e2e-spec.ts','test/control-create-account.e2e-spec.ts','test/control-customers.e2e-spec.ts'], { control: true }],
    ['primax_refactor_validation', ['--runTestsByPath','test/terminal-refactor.e2e-spec.ts'], { TERMINAL_REFACTOR_TEST: 'true' }],
    ['primax_inventory_validation', ['--runTestsByPath','test/inventory-foundations.e2e-spec.ts'], { inventory: true }],
  ]) {
    const url = new URL(original); url.pathname = '/' + database;
    url.search = '';
    const env = { ...process.env, DATABASE_URL: url.href, DATABASE_URL_UNPOOLED: url.href,
      ...(flags.V2_LOCAL_TESTS ? { V2_LOCAL_TESTS: 'true' } : {}),
      ...(flags.TERMINAL_REFACTOR_TEST ? { TERMINAL_REFACTOR_TEST: 'true' } : {}),
      ...(flags.control ? { CONTROL_TEST_DATABASE_URL: url.href } : {}),
      ...(flags.inventory ? { INVENTORY_TEST_DATABASE_URL: url.href } : {}),
    };
    const migration = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate','deploy'], { stdio: 'inherit', env });
    if (migration.status !== 0) { failed = true; continue; }
    const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--runInBand', '--config','test/jest-e2e.config.cjs', ...args], {
      stdio: 'inherit', env,
    });
    if (result.status !== 0) failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}
main().catch(async error => { console.error(error.message); await db.$disconnect(); process.exitCode = 1; });
