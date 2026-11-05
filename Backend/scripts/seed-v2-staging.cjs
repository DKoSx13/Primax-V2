// One-time bootstrap for an empty Primax V2 academic Neon staging database.
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const EXPECTED_MIGRATIONS = [
  '20261008235020_init',
  '20261008235100_constraints',
  '20261009120000_postpago_wallet',
  '20261009130000_authorization_dispensing',
  '20261009131000_dispense_progress',
  '202610120001_v9_debt_profile',
  '202610120002_v9_credit_constraints',
  '20261017000000_critical_transaction_integrity',
  '20261020000000_points_divisor',
  '20261021000000_membership_number_counter',
  '20261022000000_business_alerts',
  '20261022000000_guest_prepay_unique_documents',
  '20261022010000_align_prisma_constraints',
  '20261022010000_identity_and_recovery',
  '20261023000000_payment_lifecycle',
  '20261023000000_v11_inventory_welcome',
  '20261023010000_online_orders',
  '20261023010000_refund_reward_trace',
  '20261026000000_v12_1_operational_foundations',
  '20261026010000_v12_1_inventory_reservations',
  '20261026020000_v12_1_inventory_lifecycle',
  '20261027010000_v12_1_inventory_reconciliation',
  '20261028000000_operational_incidents',
  '20261029000000_primax_control_foundation',
  '20261029000000_reconcile_staging_membership_numbers',
  '20261029010000_primax_control_operations',
  '20261029020000_primax_control_customers_receipts',
  '20261030020000_v2_assistance',
  '20261030020100_v2_assistance_invariants',
  '20261030050000_v2_prime_numbering',
  '20261105000000_terminal_independent_operation',
];

const SEEDED_TABLES = [
  'Station', 'Fuel', 'FuelInventory', 'InventoryActivation', 'InventoryMovement',
  'Pump', 'Terminal', 'TerminalPumpAssignment', 'User', 'UserPermissionGrant',
  'AdminControlAccount', 'AdminControlGrant', 'AdminStationAssignment',
  'Membership', 'MembershipCodeAlias', 'Vehicle',
];

const USERS = [
  ['STAGING_ADMIN_EMAIL', 'STAGING_ADMIN_PASSWORD'],
  ['STAGING_CONTROL_ADMIN_EMAIL', 'STAGING_CONTROL_ADMIN_PASSWORD'],
  ['STAGING_ENCARGADO_EMAIL', 'STAGING_ENCARGADO_PASSWORD'],
  ['STAGING_PRIME_EMAIL', 'STAGING_PRIME_PASSWORD'],
];

function isPlaceholder(password) {
  return /(?:\b(?:replace|change|your|placeholder|example)\b|<[^>]+>|^password\d*$|^changeme|^secret\d*$)/i.test(password);
}

function assertTarget(env) {
  if (env.APP_MODE !== 'academic' || env.PAYMENT_ENV !== 'demo' ||
      env.DATABASE_PURPOSE !== 'academic-demo' || env.STAGING_SEED_CONFIRM !== 'primax-v2-staging')
    throw new Error('Primax V2 staging bootstrap requires exact academic/demo/staging confirmation');

  let pooled, direct;
  try {
    if (!env.DATABASE_URL || !env.DATABASE_URL_UNPOOLED) throw new Error('missing URL');
    pooled = new URL(env.DATABASE_URL);
    direct = new URL(env.DATABASE_URL_UNPOOLED);
  } catch {
    throw new Error('Both pooled and direct Neon database URLs are required');
  }
  const pooledHost = pooled.hostname.replace(/-pooler(?=\.)/, '');
  if (!pooled.hostname.endsWith('.neon.tech') || !direct.hostname.endsWith('.neon.tech') ||
      pooledHost !== direct.hostname || pooled.pathname !== direct.pathname ||
      pooled.username !== direct.username || pooled.searchParams.get('sslmode') !== 'require' ||
      direct.searchParams.get('sslmode') !== 'require')
    throw new Error('Pooled and direct URLs must target the same TLS Neon database');

  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.KIOSK_STATION_ID || ''))
    throw new Error('KIOSK_STATION_ID must be a UUID');

  for (const [emailKey, passwordKey] of USERS) {
    const email = env[emailKey] || '';
    const password = env[passwordKey] || '';
    const passwordBytes = Buffer.byteLength(password, 'utf8');
    const isPrime = emailKey === 'STAGING_PRIME_EMAIL';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8 || passwordBytes > 72 || isPlaceholder(password) ||
        isPrime && (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)))
      throw new Error(`${emailKey} and a valid 8-72 byte ${passwordKey} are required`);
  }
  if (new Set(USERS.map(([emailKey]) => env[emailKey].toLowerCase())).size !== USERS.length)
    throw new Error('Staging users must have distinct emails');
}

async function assertDatabaseReady(tx) {
  const migrationRows = await tx.$queryRaw`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM public."_prisma_migrations"
    ORDER BY started_at, migration_name
  `;
  const applied = migrationRows.filter(row => row.finished_at !== null && row.rolled_back_at === null);
  if (migrationRows.length !== EXPECTED_MIGRATIONS.length || applied.length !== EXPECTED_MIGRATIONS.length ||
      applied.some((row, index) => {
        const name = EXPECTED_MIGRATIONS[index];
        if (row.migration_name !== name) return true;
        const sql = readFileSync(join(__dirname, '..', 'prisma', 'migrations', name, 'migration.sql'));
        return row.checksum !== createHash('sha256').update(sql).digest('hex');
      }) ||
      applied[applied.length - 1]?.migration_name !== '20261105000000_terminal_independent_operation')
    throw new Error('Expected exactly the 31 completed Primax V2 migrations, ending in independent terminal operation; no changes made');

  for (const table of SEEDED_TABLES) {
    const rows = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM public."${table}"`);
    if (rows[0].count !== 0)
      throw new Error(`Bootstrap target table ${table} is not empty; no changes made`);
  }
  const counter = await tx.membershipNumberCounter.findUnique({ where: { id: 1 } });
  if (!counter)
    throw new Error('MembershipNumberCounter row 1 is missing; no changes made');
}

async function main() {
  assertTarget(process.env);
  const db = new PrismaClient();
  try {
    const passwords = await Promise.all(USERS.map(([, key]) => hash(process.env[key], 12)));
    await db.$transaction(async tx => {
      await tx.$queryRaw`
        WITH bootstrap_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext('primax-v2-staging-bootstrap'))
        )
        SELECT 1 AS locked FROM bootstrap_lock
      `;
      await assertDatabaseReady(tx);

      const station = await tx.station.create({ data: {
        id: process.env.KIOSK_STATION_ID.toLowerCase(),
        code: 'PRIMAX-SUR',
        name: 'Primax Sur',
        address: 'Lima, Perú (estación académica Primax V2 staging)',
      } });
      for (const [code, name, pricePerGallon] of [
        ['REGULAR', 'Regular', '21.30'],
        ['PREMIUM', 'Premium', '23.50'],
        ['DIESEL', 'Diésel', '26.20'],
      ]) {
        const fuel = await tx.fuel.create({ data: { code, name, pricePerGallon } });
        await tx.fuelInventory.create({ data: { stationId: station.id, fuelId: fuel.id, liters: '5000' } });
      }
      const pump = await tx.pump.create({ data: { stationId: station.id, code: '03', name: 'Surtidor 03' } });
      const terminal = await tx.terminal.create({ data: { stationId: station.id, code: 'PRIMAX-V2-STAGING-T01' } });
      await tx.terminalPumpAssignment.create({ data: {
        stationId: station.id, terminalId: terminal.id, pumpId: pump.id,
      } });

      const admin = await tx.user.create({ data: {
        email: process.env.STAGING_ADMIN_EMAIL.toLowerCase(),
        name: 'Administrador Primax V2 staging', passwordHash: passwords[0],
      } });
      await tx.userPermissionGrant.create({ data: {
        userId: admin.id, permission: 'SYSTEM_ADMIN', reason: 'Bootstrap académico Primax V2 staging',
      } });
      for (const [role, index, label, permissions] of [
        ['ADMIN', 1, 'Administrador', ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_TERMINAL_VIEW', 'ADMIN_TERMINAL_MANAGE', 'ADMIN_INCIDENT_VIEW', 'ADMIN_INCIDENT_MANAGE']],
        ['ENCARGADO', 2, 'Encargado', ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_TERMINAL_VIEW', 'ADMIN_TERMINAL_MANAGE', 'ADMIN_INCIDENT_VIEW', 'ADMIN_INCIDENT_MANAGE']],
      ]) {
        const staff = await tx.user.create({ data: {
          email: process.env[USERS[index][0]].toLowerCase(), name: `${label} Primax V2 staging`, passwordHash: passwords[index],
        } });
        const account = await tx.adminControlAccount.create({ data: {
          userId: staff.id, role, status: 'APPROVED', emailVerifiedAt: new Date(), approvedAt: new Date(), approvedByUserId: admin.id,
        } });
        await tx.adminStationAssignment.create({ data: { userId: staff.id, accountId: account.id, stationId: station.id, grantedByUserId: admin.id, reason: 'Bootstrap académico Primax V2 staging' } });
        await tx.adminControlGrant.createMany({ data: permissions.map(permission => ({ userId: staff.id, permission, grantedByUserId: admin.id, reason: 'Bootstrap académico Primax V2 staging' })) });
      }
      const prime = await tx.user.create({ data: {
        email: process.env.STAGING_PRIME_EMAIL.toLowerCase(),
        name: 'Cliente Prime académico V2', passwordHash: passwords[3],
      } });
      const membership = await tx.membership.create({
        data: { number: 'PRIME-001', userId: prime.id, dni: '12345678' },
      });
      const counterUpdate = await tx.$executeRaw`
        UPDATE "MembershipNumberCounter"
        SET "value" = GREATEST("value", 1)
        WHERE "id" = 1
      `;
      if (counterUpdate !== 1) throw new Error('MembershipNumberCounter row 1 update failed');
      await tx.vehicle.create({
        data: { plate: 'ABC-123', label: 'Vehículo académico Primax V2', membershipId: membership.id },
      });
    }, { isolationLevel: 'Serializable', timeout: 30000 });
    console.log('Primax V2 staging bootstrap complete.');
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module)
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Primax V2 staging bootstrap failed');
    process.exitCode = 1;
  });

module.exports = { assertTarget, EXPECTED_MIGRATIONS, SEEDED_TABLES };
