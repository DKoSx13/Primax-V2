const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

async function main() {
  const root = '/tmp/primax-stage3f-integration';
  fs.cpSync('/source', root, { recursive: true, filter: source => !path.relative('/source', source).split(path.sep)
    .some(p => ['node_modules', 'dist', 'build', '.cache'].includes(p) || p.startsWith('.env')) });
  fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
  require('/app/node_modules/ts-node').register({ project: root + '/tsconfig.json', transpileOnly: true });
  const { PrismaClient } = require('/app/node_modules/@prisma/client');
  const { ConfigService } = require('/app/node_modules/@nestjs/config');
  const { KioskStore } = require(root + '/src/kiosk/redis-store.ts');
  const { KioskService } = require(root + '/src/kiosk/kiosk.service.ts');
  const { lotRFixture } = require(root + '/test/identity-lot-r.fixture.ts');
  fs.copyFileSync('/reference/membership.ts', root + '/src/memberships/memberships.reference.ts');
  fs.copyFileSync('/reference/vehicle.ts', root + '/src/vehicles/vehicles.reference.ts');
  const RefMemberships = require(root + '/src/memberships/memberships.reference.ts').MembershipsService;
  const RefVehicles = require(root + '/src/vehicles/vehicles.reference.ts').VehiclesService;
  const { MembershipsRepository } = require(root + '/src/memberships/memberships.repository.ts');
  const { VehiclesRepository } = require(root + '/src/vehicles/vehicles.repository.ts');
  const { VehicleListReadAdapter } = require(root + '/services/identity/src/adapters/inbound/vehicle-list-read.adapter.ts');
  const { ListVehicles } = require(root + '/services/identity/src/application/use-cases/list-vehicles.ts');
  const { ExistingVehicleListReader } = require(root + '/services/identity/src/adapters/outbound/existing-vehicle-list.reader.ts');

  const request = require('/app/node_modules/supertest');
  const url = new URL(process.env.DATABASE_URL), redisUrl = new URL(process.env.KIOSK_REDIS_URL);
  assert.equal(url.hostname, 'postgres'); assert.equal(url.port, '5432');
  assert.equal(redisUrl.hostname, 'redis'); assert.equal(redisUrl.port, '6379');
  assert.match(process.env.ASTRA_SYNTHETIC_DB, /^synthetic_[a-f0-9]{12}$/);
  assert.match(process.env.ASTRA_NAMESPACE, /^stage3f_[a-f0-9]{12}$/);
  assert.equal(url.pathname, '/' + process.env.ASTRA_SYNTHETIC_DB);
  assert.equal(url.username, process.env.ASTRA_SYNTHETIC_USER);
  assert.equal(process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL);
  const db = new PrismaClient(); const apps = []; let store;
  try {
    const identity = await db.$queryRaw`SELECT current_database() AS db, current_user AS role`;
    assert.equal(identity[0].db, process.env.ASTRA_SYNTHETIC_DB); assert.equal(identity[0].role, process.env.ASTRA_SYNTHETIC_USER);
    const empty = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    assert.equal(empty.length, 0);
    const migrate = spawnSync(process.execPath, ['/app/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { cwd: root, encoding: 'utf8', env: process.env, shell: false });
    fs.writeFileSync('/evidence/migrate.log', (migrate.stdout || '') + (migrate.stderr || ''));
    assert.equal(migrate.status, 0);
    const migrations = await db.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const ids = Object.fromEntries(['a', 'b', 'empty', 'inactive', 'stale', 'missing', 'memberA', 'memberB', 'station'].map(k => [k, crypto.randomUUID()]));
    const stamp = new Date('2026-01-01T00:00:00Z');
    // Minimal initial data only. Never invokes register, link, login, profile or revocation commands.
    await db.$transaction(async tx => {
      for (const key of ['a', 'b', 'empty', 'inactive', 'stale']) await tx.user.create({ data: {
        id: ids[key], name: 'Synthetic owner', email: 'synthetic-' + ids[key] + '@example.invalid',
        passwordHash: 'not-a-login-fixture', active: key !== 'inactive', authVersion: key === 'stale' ? 1 : 0,
      } });
      for (const key of ['a', 'b']) await tx.membership.create({ data: { id: ids[key === 'a' ? 'memberA' : 'memberB'], userId: ids[key], number: 'SYNTHETIC-' + key } });
      for (const [plate, member] of [['AAA-002', 'memberA'], ['AAA-001', 'memberA'], ['BBB-001', 'memberB'], ['ZZZ-999', null]])
        await tx.vehicle.create({ data: { plate, label: 'Synthetic fixture', membershipId: member ? ids[member] : null, createdAt: stamp, updatedAt: stamp } });
      await tx.station.create({ data: { id: ids.station, code: 'LAB-A', name: 'Synthetic station', address: 'Synthetic location' } });
      const stationB = await tx.station.create({ data: { code: 'LAB-B', name: 'Synthetic other station', address: 'Synthetic location' } });
      const fuel = await tx.fuel.create({ data: { code: 'LAB', name: 'Synthetic fuel', pricePerGallon: '20.00' } });
      const benefit = await tx.benefit.create({ data: { code: 'LAB', title: 'Synthetic benefit', description: 'Fixture', category: 'LAB', pointsCost: 1 } });
      const vehicleA = await tx.vehicle.findUnique({ where: { plate: 'AAA-001' } });
      const vehicleB = await tx.vehicle.findUnique({ where: { plate: 'BBB-001' } });
      await tx.membership.update({ where: { id: ids.memberA }, data: { balance: '12.34' } });
      await tx.membership.update({ where: { id: ids.memberB }, data: { balance: '7.00' } });
      await tx.membershipCodeAlias.create({ data: { code: 'OLD-A', membershipId: ids.memberA } });
      for (const [member, vehicle, stationId, count] of [[ids.memberA, vehicleA, ids.station, 2], [ids.memberB, vehicleB, stationB.id, 1]]) {
        for (let i = 0; i < count; i++) {
          const sale = await tx.transaction.create({ data: { operationId: crypto.randomUUID(), requestHash: 'a'.repeat(64),
            plate: vehicle.plate, vehicleId: vehicle.id, membershipId: member, stationId, fuelId: fuel.id,
            amount: '50.00', unitPrice: '20.00', gallons: '2.500', pointsRate: '0.1000', solesPerPoint: '10.00', pointsEarned: 5,
            mode: 'POSTPAGO', status: i === 1 ? 'PAYMENT_PENDING' : 'PAID', createdAt: new Date(stamp.getTime() + i * 86400000),
            payment: { create: { amount: '50.00', method: 'SALDO_PRIME', status: i === 1 ? 'PARTIAL' : 'CAPTURED' } },
          } });
          await tx.rewardMovement.create({ data: { membershipId: member, transactionId: sale.id, kind: 'EARN', points: 5, createdAt: new Date(stamp.getTime() + i * 86400000) } });
          if (i === 1) await tx.membershipDebt.create({ data: { membershipId: member, transactionId: sale.id, amountOriginal: '3.00', amountPending: '3.00' } });
        }
      }
      const redemption = await tx.redemption.create({ data: { membershipId: ids.memberA, operationId: crypto.randomUUID(), benefitId: benefit.id, pointsSpent: 1 } });
      await tx.rewardMovement.create({ data: { membershipId: ids.memberA, redemptionId: redemption.id, kind: 'REDEEM', points: -1, createdAt: new Date(stamp.getTime() + 172800000) } });
      for (const [status, amount] of [['RESERVED', '2.00'], ['DISPENSING', '2.25'], ['INTERVENTION_REQUIRED', '13.00']])
        await tx.fuelAuthorization.create({ data: { operationId: crypto.randomUUID(), requestHash: 'b'.repeat(64),
          membershipId: ids.memberA, vehicleId: vehicleA.id, plate: vehicleA.plate, stationId: ids.station, fuelId: fuel.id,
          authorizedAmount: amount, reservedAmount: amount, balanceAfter: '12.34', status, mode: 'POSTPAGO' } });
    });
    async function fingerprint() {
      const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      const h = crypto.createHash('sha256'); let count = 0;
      for (const { tablename } of tables) {
        assert.match(tablename, /^[A-Za-z0-9_]+$/);
        const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t`);
        h.update(tablename + JSON.stringify(rows.map(r => r.row).sort())); count += rows.length;
      }
      return { sha256: h.digest('hex'), tables: tables.length, rows: count };
    }
    const before = await fingerprint();
    const gatewaySecret = crypto.randomBytes(48).toString('hex');
    const config = new ConfigService({ APP_MODE: 'local', CORS_ORIGINS: 'http://localhost',
      KIOSK_REDIS_URL: process.env.KIOSK_REDIS_URL, KIOSK_SESSION_NAMESPACE: process.env.ASTRA_NAMESPACE,
      KIOSK_GATEWAY_SECRET: gatewaySecret, KIOSK_STATION_ID: ids.station,
      KIOSK_OPERATOR_USER: 'synthetic-operator', KIOSK_OPERATOR_PASSWORD_HASH: 'not-a-login-fixture' });
    store = new KioskStore(config); const kiosk = new KioskService(config, store, db);
    assert.equal(await store.command('DBSIZE'), 0, 'Redis must be new and empty');
    const version = crypto.createHmac('sha256', gatewaySecret).update(JSON.stringify([
      config.get('KIOSK_OPERATOR_USER'), config.get('KIOSK_OPERATOR_PASSWORD_HASH'), ids.station, '1',
    ])).digest('hex');
    const validSession = crypto.randomBytes(32).toString('base64url'), expiredSession = crypto.randomBytes(32).toString('base64url');
    const wrongStationSession = crypto.randomBytes(32).toString('base64url');
    const csrf = crypto.randomBytes(32).toString('base64url');
    for (const [token, expiresAt] of [[validSession, Date.now() + 120000], [expiredSession, Date.now() - 1000]]) {
      const key = store.key('session:' + crypto.createHash('sha256').update(token).digest('hex'));
      assert.equal(await store.command('SET', key, JSON.stringify({ authenticated: true, csrf, version, stationId: ids.station, expiresAt }), 'EX', 180, 'NX'), 'OK');
    }
    assert.equal(await store.command('SET', store.key('session:' + crypto.createHash('sha256').update(wrongStationSession).digest('hex')),
      JSON.stringify({ authenticated: true, csrf, version, stationId: crypto.randomUUID(), expiresAt: Date.now() + 120000 }), 'EX', 180, 'NX'), 'OK');
    const vehicleRepo = new VehiclesRepository(db);
    const reference = { membership: new RefMemberships(new MembershipsRepository(db)),
      vehicle: new RefVehicles(vehicleRepo, new VehicleListReadAdapter(new ListVehicles(new ExistingVehicleListReader(vehicleRepo)))) };
    for (const legacy of [true, false]) apps.push(await lotRFixture(db, legacy, { config, kiosk, reference }));
    const comparisons = [];
    const sequences = () => db.$queryRaw`SELECT sequencename, last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
    const sequenceBefore = await sequences();
    async function compare(route, status, options = {}) {
      const bodies = [];
      for (const f of apps) {
        const full = '/api/v1/' + route, req = request(f.app.getHttpServer()).get(full);
        let auth = options.user ? 'Bearer ' + await f.token(ids[options.user]) : '';
        if (options.invalid) auth = 'Bearer synthetic-invalid';
        if (options.expired) auth = 'Bearer ' + await f.jwt.signAsync({ sub: ids.a }, { expiresIn: -1 });
        if (auth) req.set('Authorization', auth);
        if (options.cookie) req.set('Cookie', 'primax_control=synthetic-invalid');
        if (options.spoof) req.set('x-user-id', ids.b).set('x-membership-id', ids.memberB);
        if (options.signed) {
          const session = options.signed === 'expired' ? expiredSession : options.signed === 'wrong-station' ? wrongStationSession : validSession;
          const csrfHeader = options.badCsrf ? 'synthetic-wrong' : csrf;
          const timestamp = String(Date.now());
          const signature = crypto.createHmac('sha256', gatewaySecret).update(JSON.stringify(['GET', full, timestamp, null, session, csrfHeader, '', auth, ''])).digest('hex');
          req.set('x-kiosk-time', timestamp).set('x-kiosk-session', session).set('x-csrf-token', csrfHeader)
            .set('x-kiosk-signature', options.signed === 'bad-signature' ? '0'.repeat(64) : signature);
        }
        const response = await req.expect(status); const body = response.body;
        if (status !== 200) { assert.equal(body.statusCode, status); assert.equal(body.path, full.split('?')[0]); assert.equal(typeof body.timestamp, 'string'); delete body.timestamp; }
        if (options.check) options.check(body);
        bodies.push(body);
      }
      assert.deepEqual(bodies[0], bodies[1]);
      comparisons.push({ route: route.split('?')[0], status, matched: true });
    }
    const ownMe = body => { assert.equal(body.id, ids.memberA); assert.equal(body.balance, '12.34'); assert.equal(body.reserved, '4.25');
      assert.equal(body.available, '12.34'); assert.equal(body.total, '16.59'); assert.equal(body.pendingBalance, '3.00'); assert.equal(body.points, 9); assert.equal(body.vehicles.length, 2); };
    const routes = ['memberships/me', 'memberships/me/transactions', 'memberships/me/rewards', 'memberships/me/redemptions', 'vehicles/AAA-001'];
    for (const route of routes) {
      await compare(route, 401); await compare(route, 401, { invalid: true }); await compare(route, 401, { expired: true });
      await compare(route, 401, { user: 'stale' }); await compare(route, 403, { user: 'inactive' });
      await compare(route, 401, { cookie: true }); await compare(route, 200, { user: 'a' });
      await compare(route, 401, { signed: 'bad-signature' }); await compare(route, 401, { signed: 'expired' });
    }
    await compare('memberships/me', 200, { user: 'a', check: ownMe });
    await compare('memberships/me?userId=' + ids.b, 200, { user: 'a', spoof: true, check: ownMe });
    await compare('memberships/me', 200, { user: 'b', check: r => { assert.equal(r.id, ids.memberB); assert.equal(r.balance, '7.00'); assert.equal(r.points, 5); assert.equal(r.pendingBalance, '0.00'); } });
    for (const method of ['transactions', 'rewards', 'redemptions']) {
      const route = 'memberships/me/' + method;
      await compare(route, 200, { user: 'b', check: rows => { if (method === 'redemptions') assert.equal(rows.length, 0); else assert.equal(rows.length, 1); } });
      await compare(route + '?page=1&limit=1', 200, { user: 'a', check: rows => assert.equal(rows.length, 1) });
      await compare(route + '?page=999&limit=1', 200, { user: 'a', check: rows => assert.deepEqual(rows, []) });
      for (const query of ['page=0', 'limit=101', 'page=1&page=2', 'userId=' + ids.b, 'stationId=' + ids.station])
        await compare(route + '?' + query, 400, { user: 'a' });
      await compare(route, 404, { user: 'empty' });
      await compare(route, 403, { signed: 'valid' });
    }
    await compare('memberships/me', 404, { user: 'empty' });
    await compare('memberships/me', 403, { signed: 'valid' });
    await compare('memberships/me/transactions', 200, { user: 'a', check: rows => {
      assert.equal(rows.length, 2); assert(rows.every(r => !Object.hasOwn(r, 'requestHash')));
      assert(rows.every(r => r.receipt.number && typeof r.receipt.correlative === 'string'));
      assert(rows[0].createdAt > rows[1].createdAt); assert(rows.every(r => r.membership.id === ids.memberA));
    } });
    await compare('memberships/me/rewards', 200, { user: 'a', check: rows => { assert.equal(rows.length, 3); assert.equal(rows[0].points, -1); } });
    await compare('memberships/me/redemptions', 200, { user: 'a', check: rows => { assert.equal(rows.length, 1); assert.equal(rows[0].pointsSpent, 1); assert.equal(rows[0].benefit.code, 'LAB'); } });
    await compare('vehicles/AAA-001', 404, { user: 'b' });
    await compare('vehicles/ZZZ-000', 404, { user: 'a' });
    await compare('vehicles/invalid', 400, { user: 'a' });
    await compare('vehicles/aaa001', 200, { user: 'a' });
    await compare('vehicles/AAA-001', 200, { signed: 'valid', check: r => assert.deepEqual(r, { plate: 'AAA-001' }) });
    await compare('vehicles/BBB-001', 200, { signed: 'valid', check: r => assert.deepEqual(r, { plate: 'BBB-001' }) });
    await compare('vehicles/ZZZ-999', 200, { signed: 'valid', check: r => assert.deepEqual(r, { plate: 'ZZZ-999' }) });
    await compare('vehicles/aaa001', 403, { signed: 'valid' });
    await compare('vehicles/AAA-001', 403, { signed: 'valid', badCsrf: true });
    await compare('vehicles/AAA-001', 401, { signed: 'wrong-station' });
    assert.deepEqual(await sequences(), sequenceBefore);
    const after = await fingerprint(); assert.deepEqual(before, after);
    const redisKeys = await store.command('DBSIZE');
    assert.equal(redisKeys, 4); // Three fixtures and the original authorize rate-limit key.
    fs.writeFileSync('/evidence/integration-results.json', JSON.stringify({
      targetVerified: { newSyntheticDatabase: true, tablesBeforeMigration: 0, newRedisInitiallyEmpty: true },
      migrationsApplied: migrations[0].count, applicationSeedsExecuted: 0, comparisons: comparisons.length,
      httpRequests: comparisons.length * 2, cases: comparisons, before, after, sqlDataUnchanged: true,
      receiptSequencesUnchanged: true, referenceCommit: '1dcb5836ad2bbbb089c486eba2c9950ad05a2d55',
      realPrisma: true, realJwt: true, realKioskService: true, realKioskStore: true, redisKeys,
      redisEffects: 'Original authorization limiter writes preserved; no application vehicle writes',
    }, null, 2) + '\n');
  } finally { await Promise.all(apps.map(f => f.app.close())); if (store) await store.onModuleDestroy(); await db.$disconnect(); }
}
main().catch(error => { fs.writeFileSync('/evidence/failure.log', String(error.stack || error));
  console.error('Synthetic Identity vehicle integration failed; inspect private assertion logs.'); process.exitCode = 1; });
