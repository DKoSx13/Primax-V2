const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

async function main() {
  const root = '/tmp/primax-stage3i-integration';
  fs.cpSync('/source', root, { recursive: true, filter: source => !path.relative('/source', source).split(path.sep)
    .some(p => ['node_modules', 'dist', 'build', '.cache'].includes(p) || p.startsWith('.env')) });
  fs.symlinkSync('/app/node_modules', root + '/node_modules', 'dir');
  require('/app/node_modules/ts-node').register({ project: root + '/tsconfig.json', transpileOnly: true });
  const { PrismaClient } = require('/app/node_modules/@prisma/client');
  const { ConfigService } = require('/app/node_modules/@nestjs/config');
  const { KioskStore } = require(root + '/src/kiosk/redis-store.ts');
  const { KioskService } = require(root + '/src/kiosk/kiosk.service.ts');
  const { TransactionsRepository } = require(root + '/src/transactions/transactions.repository.ts');
  const { transactionReadFixture } = require(root + '/test/commerce-transaction-read.fixture.ts');
  const request = require('/app/node_modules/supertest');
  fs.copyFileSync('/reference/transactions.ts', root + '/src/transactions/transactions.reference.ts');
  const Reference = require(root + '/src/transactions/transactions.reference.ts').TransactionsService;
  const url = new URL(process.env.DATABASE_URL), redisUrl = new URL(process.env.KIOSK_REDIS_URL);
  assert.equal(url.hostname, 'postgres'); assert.equal(url.port, '5432');
  assert.equal(redisUrl.hostname, 'redis'); assert.equal(redisUrl.port, '6379');
  assert.match(process.env.ASTRA_SYNTHETIC_DB, /^synthetic_[a-f0-9]{12}$/);
  assert.match(process.env.ASTRA_NAMESPACE, /^stage3i_[a-f0-9]{12}$/);
  assert.equal(url.pathname, '/' + process.env.ASTRA_SYNTHETIC_DB); assert.equal(url.username, process.env.ASTRA_SYNTHETIC_USER);
  assert.equal(process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL);
  const db = new PrismaClient(), apps = []; let readDb, store;
  try {
    const identity = await db.$queryRaw`SELECT current_database() AS db, current_user AS role`;
    assert.equal(identity[0].db, process.env.ASTRA_SYNTHETIC_DB); assert.equal(identity[0].role, process.env.ASTRA_SYNTHETIC_USER);
    assert.equal((await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`).length, 0);
    const migration = spawnSync(process.execPath, ['/app/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { cwd: root, encoding: 'utf8', env: process.env });
    fs.writeFileSync('/evidence/migrate.log', (migration.stdout || '') + (migration.stderr || '')); assert.equal(migration.status, 0);
    const migrations = await db.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const ids = Object.fromEntries(['a', 'b', 'inactive', 'stale', 'empty', 'stationA', 'stationB', 'absent'].map(k => [k, crypto.randomUUID()]));
    const sales = {};
    await db.$transaction(async tx => {
      for (const key of ['a', 'b', 'inactive', 'stale', 'empty']) await tx.user.create({ data: { id: ids[key], name: 'Synthetic ' + key,
        email: key + '@synthetic.invalid', passwordHash: 'not-a-login-fixture', active: key !== 'inactive', authVersion: key === 'stale' ? 1 : 0 } });
      const members = {};
      for (const key of ['a', 'b']) members[key] = await tx.membership.create({ data: { userId: ids[key], number: 'SYNTHETIC-' + key, balance: '12.34' } });
      for (const key of ['stationA', 'stationB']) await tx.station.create({ data: { id: ids[key], code: key, name: 'Synthetic ' + key, address: 'Synthetic location' } });
      const fuel = await tx.fuel.create({ data: { code: 'LAB', name: 'Synthetic fuel', pricePerGallon: '20.00' } });
      for (const [key, owner, station, pending] of [['a', 'a', 'stationA', false], ['partial', 'a', 'stationA', true],
        ['b', 'b', 'stationB', false], ['sameStationOtherOwner', 'b', 'stationA', false], ['guest', null, 'stationA', false]]) {
        const member = owner ? members[owner] : null;
        const sale = await tx.transaction.create({ data: { operationId: crypto.randomUUID(), requestHash: 'a'.repeat(64),
          membershipId: member?.id, plate: 'AAA-001', stationId: ids[station], fuelId: fuel.id, amount: '50.00', unitPrice: '20.00', gallons: '2.500',
          pointsRate: '0.1000', pointsEarned: member ? 5 : 0, mode: member ? 'POSTPAGO' : 'PREPAGO', status: pending ? 'PAYMENT_PENDING' : 'PAID',
          payment: { create: { amount: '50.00', method: member ? 'SALDO_PRIME' : 'TARJETA', status: pending ? 'PARTIAL' : 'CAPTURED' } },
        } }); sales[key] = sale.id;
        if (member) await tx.rewardMovement.create({ data: { membershipId: member.id, transactionId: sale.id, kind: 'EARN', points: 5 } });
        if (pending) await tx.membershipDebt.create({ data: { membershipId: member.id, transactionId: sale.id, amountOriginal: '3.00', amountPending: '3.00' } });
      }
    });
    async function fingerprint() {
      const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      const h = crypto.createHash('sha256'); let rows = 0;
      for (const { tablename } of tables) {
        assert.match(tablename, /^[A-Za-z0-9_]+$/);
        const data = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${tablename}" t`);
        h.update(tablename + JSON.stringify(data.map(r => r.row).sort())); rows += data.length;
      }
      const sequences = await db.$queryRaw`SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
      return { sha256: h.digest('hex'), tables: tables.length, rows, sequences: JSON.stringify(sequences, (_, v) => typeof v === 'bigint' ? String(v) : v) };
    }
    const readUrl = new URL(process.env.DATABASE_URL); readUrl.searchParams.set('options', '-c default_transaction_read_only=on');
    readDb = new PrismaClient({ datasources: { db: { url: readUrl.toString() } } });
    assert.equal((await readDb.$queryRaw`SHOW default_transaction_read_only`)[0].default_transaction_read_only, 'on');
    const secret = crypto.randomBytes(48).toString('hex'), apiKey = crypto.randomBytes(48).toString('hex');
    const config = new ConfigService({ APP_MODE: 'local', SOLES_PER_POINT: '10', CORS_ORIGINS: 'http://localhost', KIOSK_API_KEY: apiKey,
      KIOSK_REDIS_URL: process.env.KIOSK_REDIS_URL, KIOSK_SESSION_NAMESPACE: process.env.ASTRA_NAMESPACE,
      KIOSK_GATEWAY_SECRET: secret, KIOSK_STATION_ID: ids.stationA, KIOSK_OPERATOR_USER: 'synthetic', KIOSK_OPERATOR_PASSWORD_HASH: 'not-a-login-fixture' });
    store = new KioskStore(config); assert.equal(await store.command('PING'), 'PONG'); assert.equal(await store.command('DBSIZE'), 0);
    const version = crypto.createHmac('sha256', secret).update(JSON.stringify(['synthetic', 'not-a-login-fixture', ids.stationA, '1'])).digest('hex');
    const sessions = {}, sessionSnapshots = {}, counters = {};
    for (const key of ['valid', 'expired', 'wrongStation', 'wrongVersion', 'unauthenticated', 'limited']) {
      const token = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(32).toString('base64url');
      const value = JSON.stringify({ authenticated: key !== 'unauthenticated', csrf, version: key === 'wrongVersion' ? 'obsolete' : version,
        stationId: key === 'wrongStation' ? ids.stationB : ids.stationA, expiresAt: Date.now() + (key === 'expired' ? -1000 : 120000) });
      const sessionKey = store.key('session:' + crypto.createHash('sha256').update(token).digest('hex'));
      const counterKey = store.key('limit:operations:' + crypto.createHash('sha256').update(token).digest('hex'));
      await store.command('SET', sessionKey, value, 'EX', 180, 'NX'); sessions[key] = { token, csrf, sessionKey, counterKey };
      sessionSnapshots[sessionKey] = value;
      if (key === 'limited') { await store.command('SET', counterKey, '240', 'EX', 60, 'NX'); counters[counterKey] = 240; }
    }
    const kiosk = new KioskService(config, store, readDb);
    const before = await fingerprint();
    const legacy = await transactionReadFixture(readDb, config, kiosk, new Reference(new TransactionsRepository(readDb), null, null, null, null)); apps.push(legacy.app);
    const current = await transactionReadFixture(readDb, config, kiosk); apps.push(current.app);
    const checks = [];
    async function pair(id, status, label, options = {}) {
      const full = '/api/v1/transactions/' + id + (options.query || ''), bodies = [];
      for (const fixture of [legacy, current]) {
        let auth = options.user ? 'Bearer ' + await fixture.token(ids[options.user]) : '';
        if (options.expired) auth = 'Bearer ' + await fixture.jwt.signAsync({ sub: ids.a, ver: 0 }, { expiresIn: -10 });
        if (options.invalid) auth = 'Bearer invalid-synthetic-token';
        const call = request(fixture.app.getHttpServer()).get(full);
        if (auth) call.set('Authorization', auth);
        if (options.cookie) call.set('Cookie', 'primax_control=' + await fixture.token(ids.a));
        if (options.apiKey) call.set('x-kiosk-key', options.apiKey === 'valid' ? apiKey : 'synthetic-invalid');
        if (options.spoof) call.set('x-user-id', ids.b).set('x-membership-id', 'synthetic-other');
        if (options.signed) {
          const session = sessions[options.signed], csrf = options.badCsrf ? 'synthetic-wrong' : session.csrf;
          const timestamp = String(Date.now() - (options.oldTime ? 60000 : 0));
          const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(['GET', full, timestamp, null, session.token, csrf, '', auth, ''])).digest('hex');
          call.set('x-kiosk-time', timestamp).set('x-kiosk-session', session.token).set('x-csrf-token', csrf)
            .set('x-kiosk-signature', options.badSignature ? '0'.repeat(64) : signature);
          if (['valid', 'limited'].includes(options.signed) && !options.badCsrf && !options.oldTime && !options.badSignature)
            counters[session.counterKey] = (counters[session.counterKey] || 0) + 1;
        }
        const response = await call; assert.equal(response.status, status, label);
        if (status !== 200) { assert.equal(response.body.statusCode, status); delete response.body.timestamp; }
        bodies.push(response.body);
      }
      assert.deepEqual(bodies[1], bodies[0], label + ' original/current parity'); checks.push({ label, status });
      return bodies[1];
    }
    const own = await pair(sales.a, 200, 'member owner', { user: 'a' });
    assert.equal(own.amount, '50.00'); assert.equal(own.payment.status, 'CAPTURED'); assert(own.receipt.number);
    assert.equal(typeof own.receipt.correlative, 'string'); assert.equal(Object.hasOwn(own, 'requestHash'), false);
    assert.equal(Object.hasOwn(own.membership, 'userId'), false); assert.equal(own.membership.name, 'Synthetic a');
    const partial = await pair(sales.partial, 200, 'partial debt visibility', { user: 'a' });
    assert.equal(partial.payment.status, 'PARTIAL'); assert.equal(partial.debt.amountPending, '3');
    for (const id of [sales.b, sales.sameStationOtherOwner, sales.guest, ids.absent]) await pair(id, 404, 'member cannot read other or unlinked/absent sale', { user: 'a' });
    await pair(sales.b, 200, 'second member owner', { user: 'b' });
    await pair(sales.a, 404, 'second member denied', { user: 'b' });
    await pair(sales.a, 404, 'member without membership denied', { user: 'empty' });
    for (const id of [sales.a, ids.absent, 'not-a-uuid']) await pair(id, 401, 'authentication before resource lookup');
    await pair(sales.a, 401, 'invalid token', { invalid: true }); await pair(sales.a, 401, 'expired token', { expired: true });
    await pair(sales.a, 401, 'stale authVersion', { user: 'stale' }); await pair(sales.a, 403, 'inactive user', { user: 'inactive' });
    await pair(sales.a, 401, 'Control cookie not member authentication', { cookie: true });
    await pair('not-a-uuid', 400, 'member invalid UUID', { user: 'a' });
    await pair(sales.b, 404, 'client hints cannot change owner', { user: 'a', query: '?userId=' + ids.b + '&stationId=' + ids.stationB, spoof: true });
    assert.deepEqual(await pair(sales.a, 200, 'member query ignored as before', { user: 'a', query: '?page=2&limit=1' }), own);
    for (const key of ['expired', 'wrongStation', 'wrongVersion', 'unauthenticated']) await pair(sales.a, 401, 'kiosk session rejected ' + key, { signed: key });
    await pair(sales.a, 401, 'kiosk invalid signature', { signed: 'valid', badSignature: true });
    await pair(sales.a, 401, 'kiosk old signature timestamp', { signed: 'valid', oldTime: true });
    await pair(sales.a, 403, 'kiosk CSRF mismatch', { signed: 'valid', badCsrf: true });
    assert.deepEqual(await pair(sales.a, 200, 'signed kiosk station A', { signed: 'valid' }), own);
    await pair(sales.sameStationOtherOwner, 200, 'signed kiosk allowed other owner in own station', { signed: 'valid' });
    const guest = await pair(sales.guest, 200, 'signed kiosk guest sale', { signed: 'valid' }); assert.equal(guest.membership, null);
    await pair(sales.b, 403, 'signed kiosk foreign station denied', { signed: 'valid' });
    await pair(ids.absent, 404, 'signed kiosk missing sale', { signed: 'valid' });
    await pair('not-a-uuid', 403, 'signed kiosk route policy precedes UUID pipe', { signed: 'valid' });
    await pair(sales.a, 403, 'signed kiosk query forbidden', { signed: 'valid', query: '?stationId=' + ids.stationA });
    await pair(sales.a, 200, 'signed kiosk does not require member token', { signed: 'valid', invalid: true });
    await pair(sales.a, 429, 'kiosk rate limit retained', { signed: 'limited' });
    await pair(sales.a, 401, 'invalid legacy key', { apiKey: 'invalid' });
    await pair(sales.a, 200, 'legacy key local compatibility', { apiKey: 'valid' });
    await pair(sales.b, 200, 'legacy key retains existing unscoped compatibility', { apiKey: 'valid' });
    await pair(sales.a, 401, 'invalid key cannot fall back to valid member', { apiKey: 'invalid', user: 'a' });
    config.set('APP_MODE', 'academic');
    await pair(sales.a, 401, 'legacy key rejected in academic mode', { apiKey: 'valid' });
    await pair(sales.a, 200, 'signed kiosk academic mode', { signed: 'valid' });
    config.set('APP_MODE', 'local');
    const after = await fingerprint(); assert.deepEqual(after, before);
    for (const [key, value] of Object.entries(sessionSnapshots)) assert.equal(await store.command('GET', key), value);
    for (const [key, value] of Object.entries(counters)) {
      assert.equal(await store.command('GET', key), String(value)); const ttl = await store.command('TTL', key); assert(ttl > 0 && ttl <= 60);
    }
    const keys = await store.command('KEYS', '*'); assert.deepEqual(keys.sort(), [...Object.keys(sessionSnapshots), ...Object.keys(counters)].sort());
    fs.writeFileSync('/evidence/integration-results.json', JSON.stringify({ referenceHead: '4721cb2925d9ee5df72564f91a8a51c60ab30788',
      migrations: migrations[0].count, databaseIdentityAndEmptySchemaVerified: true, readOnlyConnections: true,
      checks, comparisons: checks.length, httpRequests: checks.length * 2, before, after, financialTablesAndReceiptSequencesUnchanged: true,
      redis: { ping: true, sessionRecordsUnchanged: true, onlyExpectedLimiterKeysAdded: true, sessionKeys: Object.keys(sessionSnapshots).length,
        counterKeys: Object.keys(counters).length, expectedCounterValues: Object.values(counters), expirationVerified: true },
      limitations: ['Focused TransactionsModule/controller/guard SQL integration; not full Compose/frontends or production certificate',
        'Legacy x-kiosk-key unscoped behavior preserved outside academic mode', 'Redis rate-limit writes are legitimate and preserved; no financial writes',
        'Synthetic initial financial rows do not certify financial command engines or recovery'] }, null, 2) + '\n');
    console.log(checks.length + ' transaction read comparisons; financial tables/sequences unchanged; Redis limiter effects exact');
  } finally {
    for (const app of apps) await app.close(); if (store) await store.onModuleDestroy();
    if (readDb) await readDb.$disconnect(); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
