// Invoked only by tools/astra/stage3c-postgres.cjs in a newly provisioned private project.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

async function main() {
  const root = '/tmp/primax-stage3c-integration';
  fs.cpSync('/source', root, { recursive: true, filter: source => !path.relative('/source', source).split(path.sep)
    .some(p => ['node_modules', 'dist', 'build', '.cache'].includes(p) || p.startsWith('.env')) });
  fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
  require('/app/node_modules/ts-node').register({ project: root + '/tsconfig.json', transpileOnly: true });
  const { PrismaClient } = require('/app/node_modules/@prisma/client');
  const { catalogReadFixture } = require(root + '/test/catalog-read.fixture.ts');
  const request = require('/app/node_modules/supertest');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'postgres'); assert.equal(url.port, '5432');
  assert.match(process.env.ASTRA_SYNTHETIC_DB, /^synthetic_[a-f0-9]{12}$/);
  assert.equal(url.pathname, '/' + process.env.ASTRA_SYNTHETIC_DB);
  assert.equal(url.username, process.env.ASTRA_SYNTHETIC_USER);
  assert.equal(process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL);
  const db = new PrismaClient();
  const apps = [];
  try {
    const identity = await db.$queryRaw`SELECT current_database() AS db, current_user AS role`;
    assert.equal(identity[0].db, process.env.ASTRA_SYNTHETIC_DB);
    assert.equal(identity[0].role, process.env.ASTRA_SYNTHETIC_USER);
    const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    assert.equal(tables.length, 0, 'Synthetic target must be empty before migration');
    const migrate = spawnSync(process.execPath, ['/app/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { cwd: root, encoding: 'utf8', env: process.env, shell: false });
    fs.writeFileSync('/evidence/migrate.log', (migrate.stdout || '') + (migrate.stderr || ''));
    assert.equal(migrate.status, 0, 'Synthetic migration failed');
    const migrations = await db.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const ids = { a: crypto.randomUUID(), b: crypto.randomUUID(), inactive: crypto.randomUUID(), absent: crypto.randomUUID(),
      fuel: crypto.randomUUID(), inactiveFuel: crypto.randomUUID(), global: crypto.randomUUID(), staff: crypto.randomUUID(),
      denied: crypto.randomUUID(), member: crypto.randomUUID(), suspended: crypto.randomUUID() };
    const stamp = new Date('2026-01-01T00:00:00Z');
    await db.$transaction(async tx => {
      for (const [id, code, active] of [[ids.b, 'B', true], [ids.a, 'A', true], [ids.inactive, 'C', false]])
        await tx.station.create({ data: { id, code, active, name: 'Synthetic station', address: 'Synthetic test location', createdAt: stamp, updatedAt: stamp } });
      for (const [id, code, active] of [[ids.fuel, 'A', true], [ids.inactiveFuel, 'B', false]])
        await tx.fuel.create({ data: { id, code, active, name: 'Synthetic fuel', pricePerGallon: '21.30', createdAt: stamp, updatedAt: stamp } });
      for (const [code, active] of [['B', true], ['A', true], ['C', false]])
        await tx.benefit.create({ data: { code, active, title: 'Synthetic benefit', description: 'Synthetic fixture', category: 'TEST', pointsCost: 17, createdAt: stamp, updatedAt: stamp } });
      for (const [stationId, fuelId] of [[ids.b, ids.fuel], [ids.a, ids.fuel], [ids.inactive, ids.inactiveFuel]])
        await tx.fuelInventory.create({ data: { stationId, fuelId, liters: '123.123456', reservedLiters: '0.000001', updatedAt: stamp } });
      for (const key of ['global', 'staff', 'denied', 'member', 'suspended'])
        await tx.user.create({ data: { id: ids[key], email: 'synthetic-' + ids[key] + '@example.invalid', name: 'Synthetic user',
          passwordHash: 'not-a-login-fixture', active: key !== 'suspended' } });
      await tx.userPermissionGrant.create({ data: { userId: ids.global, permission: 'SYSTEM_ADMIN', reason: 'Synthetic fixture' } });
      for (const key of ['staff', 'denied']) {
        const account = await tx.adminControlAccount.create({ data: { userId: ids[key], role: 'ENCARGADO', status: 'APPROVED', emailVerifiedAt: stamp } });
        for (const permission of key === 'staff' ? ['ADMIN_CONTROL_ACCESS', 'ADMIN_INVENTORY_VIEW'] : ['ADMIN_CONTROL_ACCESS'])
          await tx.adminControlGrant.create({ data: { userId: ids[key], permission, reason: 'Synthetic fixture' } });
        await tx.adminStationAssignment.create({ data: { accountId: account.id, userId: ids[key], stationId: ids.a, reason: 'Synthetic fixture' } });
      }
    });
    async function digest() {
      const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      const h = crypto.createHash('sha256'); let count = 0;
      for (const { tablename } of tables) {
        assert.match(tablename, /^[A-Za-z0-9_]+$/);
        const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t`);
        h.update(tablename + JSON.stringify(rows.map(r => r.row).sort())); count += rows.length;
      }
      return { sha256: h.digest('hex'), tables: tables.length, rows: count };
    }
    const before = await digest();
    let kioskStation = ids.a;
    for (const legacy of [true, false]) apps.push(await catalogReadFixture(db, legacy, {
      kioskAuthorize: async () => ({ kind: 'kiosk', ...(kioskStation ? { stationId: kioskStation } : {}) }),
    }));
    const results = [];
    async function compare(route, status, options = {}) {
      const bodies = [];
      for (const f of apps) {
        const req = request(f.app.getHttpServer()).get('/api/v1/' + route);
        if (options.user) req.set('Authorization', 'Bearer ' + await f.token(ids[options.user], options.version || 0));
        if (options.signed) req.set('x-kiosk-signature', 'synthetic-test-authorizer');
        const response = await req.expect(status);
        if (route.includes('inventory') && status === 200) assert.equal(response.headers['cache-control'], 'no-store');
        const body = response.body;
        if (status !== 200) { assert.equal(body.statusCode, status); assert.equal(typeof body.timestamp, 'string'); delete body.timestamp; }
        if (options.check) options.check(body);
        bodies.push(body);
      }
      assert.deepEqual(bodies[0], bodies[1]);
      results.push({ route: route.split('?')[0], status, matched: true });
    }
    await compare('fuels', 200, { check: r => { assert.equal(r.length, 1); assert.equal(r[0].pricePerGallon, '21.3'); } });
    await compare('stations', 200, { check: r => assert.deepEqual(r.map(x => x.code), ['A', 'B']) });
    await compare('benefits?extra=ignored', 200, { check: r => { assert.deepEqual(r.map(x => x.code), ['A', 'B']); assert.equal(r[0].pointsCost, 17); } });
    await compare('fuels/inventory', 200, { check: r => { assert.equal(r.length, 3); assert(r.some(x => !x.fuel.active && !x.station.active));
      assert.equal(r[0].liters, '123.123456'); assert.equal(r[0].reservedLiters, '0.000001'); } });
    await compare('fuels/inventory?stationId=' + ids.b, 200, { signed: true, check: r => { assert.equal(r.length, 1); assert.equal(r[0].stationId, ids.a); } });
    await compare('stations?stationId=' + ids.b, 200, { signed: true, check: r => assert.equal(r[0].id, ids.a) });
    kioskStation = ''; await compare('fuels/inventory', 403, { signed: true }); kioskStation = ids.a;
    for (const route of ['control/catalog/stations', 'control/catalog/inventory']) {
      await compare(route, 401);
      await compare(route, 403, { signed: true });
      await compare(route, 403, { user: 'denied' });
      await compare(route, 403, { user: 'member' });
      await compare(route, 401, { user: 'suspended' });
      await compare(route, 401, { user: 'staff', version: 1 });
      await compare(route, 200, { user: 'staff', check: r => { assert.equal(r.length, 1); assert.equal(r[0].stationId || r[0].id, ids.a); } });
      await compare(route + '?stationId=' + ids.b, 403, { user: 'staff' });
      await compare(route + '?stationId=' + ids.absent, 403, { user: 'staff' });
      await compare(route + '?stationId=' + ids.b, 200, { user: 'global', check: r => assert.equal(r.length, 1) });
      await compare(route + '?stationId=' + ids.absent, 200, { user: 'global', check: r => assert.deepEqual(r, []) });
      for (const query of ['stationId=', 'stationId=invalid', `stationId=${ids.a}&stationId=${ids.b}`, 'extra=invalid'])
        await compare(route + '?' + query, 400, { user: 'global' });
    }
    await compare('control/catalog/inventory', 200, { user: 'global', check: r => assert.equal(r.length, 3) });
    await compare('control/catalog/stations', 200, { user: 'global', check: r => assert.equal(r.length, 2) });
    await compare('fuels/inventory', 200, { user: 'staff', check: r => assert.equal(r.length, 3) });
    await compare('control/catalog/stations?stationId=' + ids.inactive, 200, { user: 'global', check: r => assert.deepEqual(r, []) });
    await compare('control/catalog/inventory?stationId=' + ids.inactive, 200, { user: 'global', check: r => {
      assert.equal(r.length, 1); assert.equal(r[0].station.active, false); assert.equal(r[0].updatedAt, stamp.toISOString());
    } });
    const after = await digest(); assert.deepEqual(before, after, 'Read checks must leave all public tables unchanged');
    fs.writeFileSync('/evidence/integration-results.json', JSON.stringify({
      targetVerified: { syntheticDatabase: true, exclusiveRole: true, tablesBeforeMigration: 0 },
      migrationsApplied: migrations[0].count, applicationSeedsExecuted: 0, comparisons: results.length, httpRequests: results.length * 2,
      results, before, after, dataUnchanged: true, realPostgres: true, realPrisma: true, realJwt: true,
      kioskAuthorizer: 'controlled synthetic collaborator; no Redis or production session validation',
    }, null, 2) + '\n');
  } finally { await Promise.all(apps.map(f => f.app.close())); await db.$disconnect(); }
}
main().catch(error => { fs.writeFileSync('/evidence/failure.log', String(error.stack || error));
  console.error('Synthetic Catalog PostgreSQL validation failed; inspect private migration log and assertions.'); process.exitCode = 1; });
