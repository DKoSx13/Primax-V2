const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

async function main() {
  const root = '/tmp/primax-stage3db-integration';
  fs.cpSync('/source', root, { recursive: true, filter: source => !path.relative('/source', source).split(path.sep)
    .some(p => ['node_modules', 'dist', 'build', '.cache'].includes(p) || p.startsWith('.env')) });
  fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
  require('/app/node_modules/ts-node').register({ project: root + '/tsconfig.json', transpileOnly: true });
  const { PrismaClient } = require('/app/node_modules/@prisma/client');
  const { ConfigService } = require('/app/node_modules/@nestjs/config');
  const { KioskStore } = require(root + '/src/kiosk/redis-store.ts');
  const { KioskService } = require(root + '/src/kiosk/kiosk.service.ts');
  const { vehicleListFixture } = require(root + '/test/vehicle-list.fixture.ts');
  const request = require('/app/node_modules/supertest');
  const url = new URL(process.env.DATABASE_URL), redisUrl = new URL(process.env.KIOSK_REDIS_URL);
  assert.equal(url.hostname, 'postgres'); assert.equal(url.port, '5432');
  assert.equal(redisUrl.hostname, 'redis'); assert.equal(redisUrl.port, '6379');
  assert.match(process.env.ASTRA_SYNTHETIC_DB, /^synthetic_[a-f0-9]{12}$/);
  assert.match(process.env.ASTRA_NAMESPACE, /^stage3db_[a-f0-9]{12}$/);
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
    const csrf = crypto.randomBytes(32).toString('base64url');
    for (const [token, expiresAt] of [[validSession, Date.now() + 120000], [expiredSession, Date.now() - 1000]]) {
      const key = store.key('session:' + crypto.createHash('sha256').update(token).digest('hex'));
      assert.equal(await store.command('SET', key, JSON.stringify({ authenticated: true, csrf, version, stationId: ids.station, expiresAt }), 'EX', 180, 'NX'), 'OK');
    }
    for (const legacy of [true, false]) apps.push(await vehicleListFixture(db, legacy, { config, kiosk }));
    const comparisons = [];
    async function compare(name, status, options = {}) {
      const route = '/api/v1/vehicles' + (options.query || ''); const bodies = [];
      for (const f of apps) {
        const req = request(f.app.getHttpServer()).get(route);
        let auth = '';
        if (options.user) auth = 'Bearer ' + await f.token(ids[options.user]);
        if (options.invalid) auth = 'Bearer synthetic-invalid';
        if (options.expired) auth = 'Bearer ' + await f.jwt.signAsync({ sub: ids.a }, { expiresIn: -1 });
        if (options.wrongAudience) auth = 'Bearer ' + await f.jwt.signAsync({ sub: ids.a }, { audience: 'synthetic-other' });
        if (auth) req.set('Authorization', auth);
        if (options.spoof) req.set('x-user-id', ids.b).set('x-membership-id', ids.memberB);
        if (options.body) req.send({ userId: ids.b, membershipId: ids.memberB });
        if (options.cookie) req.set('Cookie', 'primax_control=synthetic-invalid');
        if (options.key) req.set('x-kiosk-key', 'synthetic-invalid');
        if (options.signed) {
          const session = options.signed === 'valid' ? validSession : options.signed === 'expired' ? expiredSession : crypto.randomBytes(32).toString('base64url');
          const timestamp = String(Date.now());
          const signature = crypto.createHmac('sha256', gatewaySecret)
            .update(JSON.stringify(['GET', route, timestamp, null, session, csrf, '', auth, ''])).digest('hex');
          req.set('x-kiosk-time', timestamp).set('x-kiosk-session', session).set('x-csrf-token', csrf)
            .set('x-kiosk-signature', options.signed === 'bad-signature' ? '0'.repeat(64) : signature);
        }
        const response = await req.expect(status); const body = response.body;
        if (status === 200) {
          assert(Array.isArray(body)); assert.deepEqual(body.map(r => r.plate), options.plates);
          for (const row of body) {
            assert.deepEqual(Object.keys(row).sort(), ['id', 'plate', 'label', 'membershipId', 'createdAt', 'updatedAt'].sort());
            assert.equal(row.membershipId, options.user === 'b' ? ids.memberB : ids.memberA);
            assert.equal(row.createdAt, stamp.toISOString());
          }
        } else { assert.equal(body.statusCode, status); assert.equal(body.path, '/api/v1/vehicles'); assert.equal(typeof body.timestamp, 'string'); delete body.timestamp; }
        bodies.push(body);
      }
      assert.deepEqual(bodies[0], bodies[1]); comparisons.push({ name, status, matched: true });
    }
    await compare('anonymous', 401);
    await compare('invalid token', 401, { invalid: true });
    await compare('expired token', 401, { expired: true });
    await compare('wrong audience', 401, { wrongAudience: true });
    await compare('inactive persisted user', 403, { user: 'inactive' });
    await compare('missing persisted user', 403, { user: 'missing' });
    await compare('old authVersion', 401, { user: 'stale' });
    await compare('Control cookie is not member auth', 401, { cookie: true });
    await compare('kiosk key is not member auth', 401, { key: true });
    await compare('owner A ordered own vehicles', 200, { user: 'a', plates: ['AAA-001', 'AAA-002'] });
    await compare('owner B cannot read A', 200, { user: 'b', plates: ['BBB-001'] });
    await compare('no membership or vehicles', 200, { user: 'empty', plates: [] });
    await compare('spoofed headers ignored', 200, { user: 'a', spoof: true, plates: ['AAA-001', 'AAA-002'] });
    await compare('spoofed GET body ignored', 200, { user: 'a', body: true, plates: ['AAA-001', 'AAA-002'] });
    await compare('page 1', 200, { user: 'a', query: '?page=1&limit=1', plates: ['AAA-001'] });
    await compare('page 2', 200, { user: 'a', query: '?page=2&limit=1', plates: ['AAA-002'] });
    await compare('empty page', 200, { user: 'a', query: '?page=99&limit=1', plates: [] });
    await compare('maximum limit', 200, { user: 'a', query: '?limit=100', plates: ['AAA-001', 'AAA-002'] });
    for (const query of ['userId=' + ids.b, 'membershipId=' + ids.memberB, 'plate=BBB-001', 'sort=desc',
      'page=0', 'page=-1', 'page=1.5', 'page=abc', 'page=1&page=2', 'limit=0', 'limit=101', 'limit=1&limit=2', 'limit='])
      await compare('invalid query ' + query.split('=')[0], 400, { user: 'a', query: '?' + query });
    await compare('invalid HMAC', 401, { signed: 'bad-signature' });
    await compare('missing Redis session', 401, { signed: 'missing' });
    await compare('expired Redis session', 401, { signed: 'expired' });
    await compare('valid Redis kiosk session is forbidden from member list', 403, { signed: 'valid' });
    await compare('signed session cannot override a member token', 403, { signed: 'valid', user: 'a' });
    const after = await fingerprint(); assert.deepEqual(before, after);
    const redisKeys = await store.command('DBSIZE');
    assert.equal(redisKeys, 3); // Two fixtures and the original authorize rate-limit key.
    fs.writeFileSync('/evidence/integration-results.json', JSON.stringify({
      targetVerified: { newSyntheticDatabase: true, tablesBeforeMigration: 0, newRedisInitiallyEmpty: true },
      migrationsApplied: migrations[0].count, applicationSeedsExecuted: 0, comparisons: comparisons.length,
      httpRequests: comparisons.length * 2, cases: comparisons, before, after, sqlDataUnchanged: true,
      realPrisma: true, realJwt: true, realKioskService: true, realKioskStore: true, redisKeys,
      redisEffects: 'Original authorization limiter writes preserved; no application vehicle writes',
    }, null, 2) + '\n');
  } finally { await Promise.all(apps.map(f => f.app.close())); if (store) await store.onModuleDestroy(); await db.$disconnect(); }
}
main().catch(error => { fs.writeFileSync('/evidence/failure.log', String(error.stack || error));
  console.error('Synthetic Identity vehicle integration failed; inspect private assertion logs.'); process.exitCode = 1; });
