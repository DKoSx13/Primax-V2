const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

async function main() {
  const root = '/tmp/primax-stage3g-integration';
  fs.cpSync('/source', root, { recursive: true, filter: source => !path.relative('/source', source).split(path.sep)
    .some(p => ['node_modules', 'dist', 'build', '.cache'].includes(p) || p.startsWith('.env')) });
  fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
  require('/app/node_modules/ts-node').register({ project: root + '/tsconfig.json', transpileOnly: true });
  const { PrismaClient } = require('/app/node_modules/@prisma/client');
  const { administrativeFixture } = require(root + '/test/administration-lists.fixture.ts');
  const { ConfigService } = require('/app/node_modules/@nestjs/config');
  const { KioskStore } = require(root + '/src/kiosk/redis-store.ts');
  const request = require('/app/node_modules/supertest');
  fs.copyFileSync('/reference/customers.ts', root + '/src/control/control-customers.reference.ts');
  const Reference = require(root + '/src/control/control-customers.reference.ts').ControlCustomersService;
  const url = new URL(process.env.DATABASE_URL), redisUrl = new URL(process.env.KIOSK_REDIS_URL);
  assert.equal(url.hostname, 'postgres'); assert.equal(url.port, '5432');
  assert.equal(redisUrl.hostname, 'redis'); assert.equal(redisUrl.port, '6379');
  assert.match(process.env.ASTRA_SYNTHETIC_DB, /^synthetic_[a-f0-9]{12}$/);
  assert.match(process.env.ASTRA_NAMESPACE, /^stage3g_[a-f0-9]{12}$/);
  assert.equal(url.pathname, '/' + process.env.ASTRA_SYNTHETIC_DB);
  assert.equal(url.username, process.env.ASTRA_SYNTHETIC_USER);
  assert.equal(process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL);
  const db = new PrismaClient(), apps = []; let store, readDb;
  try {
    const identity = await db.$queryRaw`SELECT current_database() AS db, current_user AS role`;
    assert.equal(identity[0].db, process.env.ASTRA_SYNTHETIC_DB); assert.equal(identity[0].role, process.env.ASTRA_SYNTHETIC_USER);
    assert.equal((await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).length, 0);
    const migrate = spawnSync(process.execPath, ['/app/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { cwd: root, encoding: 'utf8', env: process.env, shell: false });
    fs.writeFileSync('/evidence/migrate.log', (migrate.stdout || '') + (migrate.stderr || '')); assert.equal(migrate.status, 0);
    const migrations = await db.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const ids = Object.fromEntries(['A', 'B', 'C', 'unknown', 'staffA', 'staffB', 'multi', 'global', 'denied', 'customerOnly',
      'noStations', 'inactive', 'stale', 'pending', 'member', 'disabledStation', 'ended', 'noAccess', 'revoked'].map(k => [k, crypto.randomUUID()]));
    const customers = {};
    await db.$transaction(async tx => {
      for (const key of ['A', 'B', 'C']) await tx.station.create({ data: { id: ids[key], code: key, name: 'Synthetic ' + key, address: 'Synthetic location', active: key !== 'C' } });
      const fuel = await tx.fuel.create({ data: { code: 'LAB', name: 'Synthetic fuel', pricePerGallon: '20.00' } });
      const permissions = ['ADMIN_CONTROL_ACCESS', 'ADMIN_CUSTOMER_VIEW', 'ADMIN_MEMBERSHIP_VIEW', 'ADMIN_VEHICLE_VIEW'];
      for (const key of Object.keys(ids).filter(k => !['A', 'B', 'C', 'unknown'].includes(k))) {
        const user = await tx.user.create({ data: { id: ids[key], name: 'Synthetic operator ' + key, email: key.toLowerCase() + '@synthetic.invalid',
          passwordHash: 'not-a-login-fixture', active: key !== 'inactive', authVersion: key === 'stale' ? 1 : 0 } });
        if (key === 'global') { await tx.userPermissionGrant.create({ data: { userId: user.id, permission: 'SYSTEM_ADMIN', reason: 'Synthetic fixture' } }); continue; }
        if (key === 'member') continue;
        const account = await tx.adminControlAccount.create({ data: { userId: user.id, role: 'ENCARGADO', status: key === 'pending' ? 'PENDING_APPROVAL' : 'APPROVED', emailVerifiedAt: new Date() } });
        for (const permission of permissions.filter(p => key === 'denied' ? p === 'ADMIN_CONTROL_ACCESS' : key === 'customerOnly' ? ['ADMIN_CONTROL_ACCESS', 'ADMIN_CUSTOMER_VIEW'].includes(p) : key === 'noAccess' ? p !== 'ADMIN_CONTROL_ACCESS' : true))
          await tx.adminControlGrant.create({ data: { userId: user.id, permission, reason: 'Synthetic fixture', revokedAt: key === 'revoked' && permission !== 'ADMIN_CONTROL_ACCESS' ? new Date() : null } });
        for (const stationId of key === 'noStations' ? [] : key === 'staffB' ? [ids.B] : key === 'multi' ? [ids.A, ids.B] : key === 'disabledStation' ? [ids.C] : [ids.A])
          await tx.adminStationAssignment.create({ data: { userId: user.id, accountId: account.id, stationId, reason: 'Synthetic fixture', endedAt: key === 'ended' ? new Date() : null } });
      }
      let order = 0;
      for (const [key, stations] of [['A', ['A']], ['B', ['B']], ['AB', ['B', 'A']], ['C', ['C']], ['NONE', []], ['INACTIVE', ['A']]]) {
        const stamp = new Date(Date.UTC(2026, 0, ++order));
        const user = await tx.user.create({ data: { name: 'Common Client ' + key, email: 'client-' + key.toLowerCase() + '@synthetic.invalid', passwordHash: 'not-a-login-fixture', active: key !== 'INACTIVE', createdAt: stamp } });
        const member = await tx.membership.create({ data: { userId: user.id, number: 'COMMON-' + key, balance: '12.34', status: key === 'B' ? 'SUSPENDED' : 'ACTIVE', createdAt: stamp, updatedAt: stamp } });
        customers[key] = { userId: user.id, memberId: member.id, vehicles: [] };
        for (const [i, station] of stations.entries()) {
          const vehicle = await tx.vehicle.create({ data: { membershipId: member.id, plate: key.slice(0, 3).padEnd(3, 'X') + '-' + String(i + 1).padStart(3, '0'), label: 'Synthetic ' + key, createdAt: stamp, updatedAt: stamp } });
          customers[key].vehicles.push(vehicle.id);
          if (key === 'AB' && station === 'A') await tx.fuelAuthorization.create({ data: { operationId: crypto.randomUUID(), requestHash: 'b'.repeat(64), membershipId: member.id, vehicleId: vehicle.id, plate: vehicle.plate, stationId: ids[station], fuelId: fuel.id, authorizedAmount: '2.00', reservedAmount: '2.00', balanceAfter: '12.34', status: 'RESERVED', mode: 'POSTPAGO', createdAt: stamp } });
          else await tx.transaction.create({ data: { operationId: crypto.randomUUID(), requestHash: 'a'.repeat(64), membershipId: member.id, vehicleId: vehicle.id, plate: vehicle.plate, stationId: ids[station], fuelId: fuel.id, amount: '50.00', unitPrice: '20.00', gallons: '2.500', pointsRate: '0.1000', pointsEarned: 0, mode: 'POSTPAGO', createdAt: stamp } });
        }
      }
    });
    async function fingerprint() {
      const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      const h = crypto.createHash('sha256'); let count = 0;
      for (const { tablename } of tables) {
        assert.match(tablename, /^[A-Za-z0-9_]+$/);
        const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t`);
        h.update(tablename + JSON.stringify(rows.map(r => r.row).sort())); count += rows.length;
      }
      const sequences = await db.$queryRaw`SELECT sequencename, last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
      return { sha256: h.digest('hex'), tables: tables.length, rows: count, sequences: JSON.stringify(sequences, (_, v) => typeof v === 'bigint' ? String(v) : v) };
    }
    store = new KioskStore(new ConfigService({ APP_MODE: 'local', KIOSK_REDIS_URL: process.env.KIOSK_REDIS_URL, KIOSK_SESSION_NAMESPACE: process.env.ASTRA_NAMESPACE }));
    assert.equal(await store.command('PING'), 'PONG'); assert.equal(await store.command('DBSIZE'), 0);
    const before = await fingerprint();
    const readUrl = new URL(process.env.DATABASE_URL);
    readUrl.searchParams.set('options', '-c default_transaction_read_only=on');
    readDb = new PrismaClient({ datasources: { db: { url: readUrl.toString() } } });
    const readOnly = await readDb.$queryRaw`SHOW default_transaction_read_only`;
    assert.equal(readOnly[0].default_transaction_read_only, 'on');
    const legacy = await administrativeFixture(readDb, new Reference(readDb)); apps.push(legacy.app);
    const current = await administrativeFixture(readDb); apps.push(current.app);
    const checks = [], requests = { customers: 0, memberships: 0, vehicles: 0 };
    async function pair(route, label, key, query, status = 200, options = {}) {
      const bodies = [];
      for (const fixture of [legacy, current]) {
        let call = request(fixture.app.getHttpServer()).get('/api/v1/control/' + route).query(query || {});
        if (key) {
          const token = options.expired ? await fixture.jwt.signAsync({ sub: ids[key], ver: 0 }, { expiresIn: -10 }) : await fixture.token(ids[key]);
          call = options.cookie ? call.set('Cookie', 'primax_control=' + token) : call.set('Authorization', 'Bearer ' + token);
        }
        if (options.invalid) call = call.set('Authorization', 'Bearer invalid-synthetic-token');
        if (options.signed) call = call.set('x-kiosk-signature', 'synthetic-signature');
        if (options.csrf) call = call.set('x-csrf-token', 'synthetic-unused-get');
        const response = await call; assert.equal(response.status, status, route + ':' + label);
        const body = response.body; if (body && !Array.isArray(body)) delete body.timestamp;
        bodies.push(body); requests[route]++;
      }
      assert.deepEqual(bodies[1], bodies[0], route + ':' + label + ' parity');
      checks.push({ route, label, status }); return bodies[1];
    }
    for (const route of Object.keys(requests)) {
      const rows = await pair(route, 'assigned A only', 'staffA');
      const selected = route === 'customers' ? rows.map(r => r.id) : route === 'memberships' ? rows.map(r => r.id) : rows.map(r => r.id);
      const expectedKeys = route === 'customers' ? ['A', 'AB'] : ['A', 'AB', 'INACTIVE'];
      const expected = expectedKeys.flatMap(k => route === 'customers' ? [customers[k].userId] : route === 'memberships' ? [customers[k].memberId] : k === 'AB' ? [customers[k].vehicles[1]] : customers[k].vehicles);
      assert.deepEqual([...selected].sort(), expected.sort(), 'Explicit expected A scope');
      if (route === 'customers') {
        const shared = rows.find(r => r.id === customers.AB.userId);
        assert.deepEqual(shared.vehicles.map(r => r.id), [customers.AB.vehicles[1]], 'Nested vehicles must respect station scope');
      }
      const b = await pair(route, 'assigned B', 'staffB'); assert.equal(b.length, 2);
      const multi = await pair(route, 'multiple stations', 'multi'); assert(multi.length > rows.length);
      const global = await pair(route, 'system admin', 'global'); assert(global.length > rows.length);
      if (route !== 'vehicles') {
        const customer = rows.find(r => route === 'customers' ? r.id === customers.A.userId : r.id === customers.A.memberId);
        assert.match(route === 'customers' ? customer.email : customer.customer.email, /•••/);
        assert.equal(Object.hasOwn(route === 'customers' ? customer.membership : customer, 'balance'), false);
        const full = global.find(r => route === 'customers' ? r.id === customers.A.userId : r.id === customers.A.memberId);
        assert.equal((route === 'customers' ? full.membership : full).balance, '12.34');
      }
      await pair(route, 'explicit assigned station', 'multi', { stationId: ids.A });
      assert.deepEqual(await pair(route, 'search cannot cross station', 'staffA', { q: route === 'vehicles' ? 'BXX-001' : 'COMMON-B' }), []);
      const searched = await pair(route, 'trim case insensitive search', 'staffA', { q: '  common client a  ' });
      assert(searched.length > 0);
      await pair(route, 'foreign station denied', 'staffA', { stationId: ids.B }, 403);
      assert.deepEqual(await pair(route, 'nonexistent global station', 'global', { stationId: ids.unknown }), []);
      await pair(route, 'disabled station historical global', 'global', { stationId: ids.C });
      await pair(route, 'no assignments', 'noStations', {}, 403);
      await pair(route, 'inactive station assignment', 'disabledStation', {}, 403);
      await pair(route, 'ended assignment', 'ended', {}, 403);
      await pair(route, 'missing route permission', 'denied', {}, 403);
      await pair(route, 'revoked route permission', 'revoked', {}, 403);
      await pair(route, 'missing control access', 'noAccess', {}, 403);
      await pair(route, 'pending approval', 'pending', {}, 403);
      await pair(route, 'member not administrator', 'member', {}, 403);
      await pair(route, 'no authentication', null, {}, 401);
      await pair(route, 'invalid bearer', null, {}, 401, { invalid: true });
      await pair(route, 'expired bearer', 'staffA', {}, 401, { expired: true });
      await pair(route, 'inactive user', 'inactive', {}, 401);
      await pair(route, 'stale authVersion', 'stale', {}, 401);
      await pair(route, 'cookie GET without csrf', 'staffA', {}, 200, { cookie: true });
      await pair(route, 'cookie GET csrf unchanged', 'staffA', {}, 200, { cookie: true, csrf: true });
      await pair(route, 'bearer overrides cookie', 'staffA', {}, 401, { cookie: true, invalid: true });
      await pair(route, 'kiosk rejected before authorization', 'staffA', {}, 403, { signed: true });
      await pair(route, 'invalid station id', 'staffA', { stationId: 'invalid' }, 400);
      await pair(route, 'q length invalid', 'staffA', { q: 'a'.repeat(81) }, 400);
      await pair(route, 'client pagination unsupported', 'staffA', { page: 1, limit: 10 }, 400);
      assert.deepEqual(await pair(route, 'nonexistent search', 'staffA', { q: 'not-found' }), []);
    }
    await pair('memberships', 'status and station conjunctive', 'multi', { stationId: ids.B, status: 'SUSPENDED', q: 'common' });
    assert.deepEqual(await pair('memberships', 'status cannot bypass station', 'staffA', { status: 'SUSPENDED' }), []);
    await pair('memberships', 'invalid status', 'staffA', { status: 'INVALID' }, 400);
    const redacted = await pair('customers', 'related permissions redaction', 'customerOnly');
    assert(redacted.every(r => r.membership === null && r.vehicles.length === 0));
    const after = await fingerprint(); assert.deepEqual(after, before, 'No table or sequence writes during reads');
    assert.equal(await store.command('DBSIZE'), 0);
    fs.writeFileSync('/evidence/integration-results.json', JSON.stringify({
      referenceHead: '26d2d86234f28b6950d174745a0a03c145137120', migrations: migrations[0].count,
      databaseIdentityVerified: true, newEmptyDatabaseVerified: true, checks, requests,
      before, after, tablesAndSequencesUnchanged: true, readConnectionsEnforceReadOnly: true, redisPing: true, redisKeysBefore: 0, redisKeysAfter: 0,
      limitations: ['Focused real HTTP controller/guard composition, not a complete Compose/frontend run', 'Redis connectivity and zero writes; selected reads do not use Redis', 'No POST/CSRF or login implementation changed or validated'],
    }, null, 2) + '\n');
    console.log('Administrative read parity: ' + checks.length + ' comparisons, ' + Object.values(requests).reduce((a,b)=>a+b,0) + ' HTTP requests');
  } finally {
    for (const app of apps) await app.close();
    if (store) await store.onModuleDestroy();
    if (readDb) await readDb.$disconnect();
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
