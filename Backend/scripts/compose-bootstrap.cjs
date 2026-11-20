// Compose initialization job, never a business runtime or a schema reset.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { validateEnvironment } = require('../dist/src/config/environment');
const { assertLocalDatabase } = require('./database-safety.cjs');
const stateFile = '/state/bootstrap.json';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
  validateEnvironment(process.env);
  assertLocalDatabase();
  assert.equal(process.env.APP_MODE, 'local');
  assert.equal(process.env.PAYMENT_ENV, 'demo');
  assert.equal(process.env.DATABASE_PURPOSE, 'local-v12.1-demo');
  assert.notEqual(process.env.RESYNC_DEMO_PASSWORD, '1');
  assert.equal(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED);
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'postgres'); assert.equal(url.port, '5432');
  const owner = JSON.parse(fs.readFileSync('/state/.primax-astra-owner.json', 'utf8'));
  assert.equal(owner.project, process.env.COMPOSE_PROJECT_NAME);
  assert.equal(owner.kind, 'bootstrap');
  assert.equal(owner.purpose, 'primax-astra-original-synthetic-v1');
  const migrations = fs.readdirSync('prisma/migrations').filter(name => fs.existsSync('prisma/migrations/' + name + '/migration.sql')).sort();
  assert.equal(migrations.length, 36);
  const migrationHash = digest(migrations.map(name => name + '\n' + fs.readFileSync('prisma/migrations/' + name + '/migration.sql')).join('\n'));
  const configurationHash = digest(JSON.stringify(['DATABASE_URL', 'DEMO_PASSWORD', 'DEMO_CONTROL_ADMIN_EMAIL', 'DEMO_CONTROL_ADMIN_PASSWORD', 'DEMO_ENCARGADO_EMAIL', 'DEMO_ENCARGADO_PASSWORD'].map(key => [key, process.env[key]])));
  const expected = { project: owner.project, migrationHash, configurationHash };
  const db = new PrismaClient();
  try {
    const identity = await db.$queryRaw`SELECT current_database() AS db, current_user AS role`;
    assert.equal(identity[0].db, process.env.POSTGRES_DB);
    assert.equal(identity[0].role, process.env.POSTGRES_USER);
    const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
    let state;
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      for (const [key, value] of Object.entries(expected)) assert.equal(state[key], value, 'Bootstrap configuration/migration drift: ' + key);
      assert(['initializing', 'ready'].includes(state.phase));
    } else {
      assert.equal(tables.length, 0, 'Existing database without owned initialization state; migrations/seeds refused');
      state = { ...expected, phase: 'initializing' };
      fs.writeFileSync(stateFile, JSON.stringify(state) + '\n', { flag: 'wx', mode: 0o600 });
    }
    if (state.phase !== 'ready') {
      for (const args of [
        ['scripts/local-db-command.cjs', 'prisma', 'migrate', 'deploy'],
        ['scripts/seed-local-demo.cjs'],
        ['scripts/seed-control-admin.cjs'],
        ['scripts/seed-local-operations.cjs'],
      ]) {
        const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
        assert.equal(result.status, 0, 'Initialization job failed: ' + args[0]);
      }
    }
    const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    assert.deepEqual(applied.map(row => row.migration_name), migrations);
    const schema = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
    assert.equal(schema.length, 41, 'Expected 40 application tables plus Prisma metadata');
    const next = { ...expected, phase: 'ready', migrations: 36, tables: 41 };
    if (state.phase !== 'ready') {
      fs.writeFileSync(stateFile + '.tmp', JSON.stringify(next) + '\n', { mode: 0o600 });
      fs.renameSync(stateFile + '.tmp', stateFile);
    }
    console.log(state.phase === 'ready' ? 'Owned database ready: verified 36 migrations/41 tables; migrations and seeds skipped.' : 'Owned synthetic initialization complete: 36 migrations, 41 tables, three original demo seeds.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
