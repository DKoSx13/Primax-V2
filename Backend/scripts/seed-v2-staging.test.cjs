const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTarget, EXPECTED_MIGRATIONS } = require('./seed-v2-staging.cjs');

const valid = {
  APP_MODE: 'academic', PAYMENT_ENV: 'demo', DATABASE_PURPOSE: 'academic-demo',
  STAGING_SEED_CONFIRM: 'primax-v2-staging',
  DATABASE_URL: 'postgresql://user:private@ep-test-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
  DATABASE_URL_UNPOOLED: 'postgresql://user:private@ep-test.us-east-1.aws.neon.tech/neondb?sslmode=require',
  KIOSK_STATION_ID: '11111111-1111-4111-8111-111111111111',
  STAGING_ADMIN_EMAIL: 'admin@primax-v2.test', STAGING_ADMIN_PASSWORD: '9a!Qk2p@L7vX4mNc',
  STAGING_CONTROL_ADMIN_EMAIL: 'control-admin@primax-v2.test', STAGING_CONTROL_ADMIN_PASSWORD: '6b#Rm8w$T3zP5nKd',
  STAGING_ENCARGADO_EMAIL: 'encargado@primax-v2.test', STAGING_ENCARGADO_PASSWORD: 'Primax123',
  STAGING_PRIME_EMAIL: 'prime@primax-v2.test', STAGING_PRIME_PASSWORD: '2c&Hs9y!V4qL7xBa',
};

test('V2 guard accepts only the confirmed academic/demo Neon target', () => {
  assert.doesNotThrow(() => assertTarget(valid));
  for (const patch of [
    { STAGING_SEED_CONFIRM: 'primax-v12-1-staging' },
    { APP_MODE: 'production' },
    { PAYMENT_ENV: 'live' },
    { DATABASE_PURPOSE: 'production' },
    { DATABASE_URL_UNPOOLED: undefined },
    { DATABASE_URL_UNPOOLED: valid.DATABASE_URL_UNPOOLED.replace('ep-test.', 'ep-other.') },
    { DATABASE_URL: valid.DATABASE_URL.replace('sslmode=require', 'sslmode=disable') },
    { KIOSK_STATION_ID: 'not-a-uuid' },
    { STAGING_CONTROL_ADMIN_EMAIL: valid.STAGING_ADMIN_EMAIL },
    { STAGING_ADMIN_PASSWORD: 'short' },
    { STAGING_ADMIN_PASSWORD: '1234567890123456789012345678901234567890123456789012345678901234567890123' },
    { STAGING_ADMIN_PASSWORD: 'replace-this-private-value' },
  ]) assert.throws(() => assertTarget({ ...valid, ...patch }));
});

test('V2 migration guard is pinned to all 31 migrations and the independent terminal migration', () => {
  assert.equal(EXPECTED_MIGRATIONS.length, 31);
  assert.equal(EXPECTED_MIGRATIONS.at(-1), '20261105000000_terminal_independent_operation');
});
