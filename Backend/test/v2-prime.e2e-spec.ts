import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  nextMembershipNumber,
  formatMembershipNumber,
} from '../src/users/membership-number';

const suite = process.env.V2_LOCAL_TESTS === 'true' ? describe : describe.skip;
suite('PRIME allocation and migration on local PostgreSQL', () => {
  let db: PrismaService;
  let schema: string;
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      target.host !== '127.0.0.1:26602' ||
      target.pathname !== '/primax_v2_test'
    )
      throw Error('Dedicated local V2 DB required');
    target.searchParams.set(
      'schema',
      'primealloc_' + randomUUID().replaceAll('-', ''),
    );
    const { execFileSync } = await import('node:child_process');
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: {
          ...process.env,
          DATABASE_URL: target.toString(),
          DATABASE_URL_UNPOOLED: target.toString(),
        },
        stdio: 'pipe',
      },
    );
    db = new PrismaService({ datasourceUrl: target.toString() });
    await db.$connect();
    schema = 'prime_' + randomUUID().replaceAll('-', '');
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  it('allocates unique membership codes concurrently across 999/A001 and A999/B001', async () => {
    for (const boundary of [998n, 1997n]) {
      // Only this dedicated test database is used. Counter reset is test setup, not allocator logic.
      await db.membershipNumberCounter.update({
        where: { id: 1 },
        data: { value: boundary },
      });
      const codes = await Promise.all(
        Array.from({ length: 8 }, () =>
          db.$transaction(async (tx) => {
            const number = await nextMembershipNumber(tx);
            const user = await tx.user.create({
              data: {
                email: randomUUID() + '@prime.test',
                name: 'Prime concurrent',
                passwordHash: 'not-used',
              },
            });
            await tx.membership.create({ data: { userId: user.id, number } });
            return number;
          }),
        ),
      );
      expect(new Set(codes).size).toBe(8);
      expect(codes).toContain(formatMembershipNumber(boundary + 1n));
      expect(codes).toContain(formatMembershipNumber(boundary + 2n));
      expect(
        await db.membership.count({ where: { number: { in: codes } } }),
      ).toBe(8);
    }
  });
  it('migrates legacy codes transactionally, preserves IDs/relations/money and aliases collisions', async () => {
    // A minimal separate schema exercises the exact migration SQL without touching public records.
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe(
      `CREATE TABLE "${schema}"."MembershipNumberCounter" (id INT PRIMARY KEY,value BIGINT NOT NULL)`,
    );
    await db.$executeRawUnsafe(
      `CREATE TABLE "${schema}"."Membership" (id UUID PRIMARY KEY,number VARCHAR(30) UNIQUE NOT NULL,"createdAt" TIMESTAMPTZ DEFAULT now(),balance NUMERIC(12,2) NOT NULL DEFAULT 125.50)`,
    );
    await db.$executeRawUnsafe(
      `CREATE TABLE "${schema}"."Vehicle" (id UUID PRIMARY KEY,"membershipId" UUID REFERENCES "${schema}"."Membership"(id))`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "${schema}"."MembershipNumberCounter" VALUES (1,0)`,
    );
    const source = [
      'PRIM-001',
      'PRIM-999',
      'PRIM-001A',
      'PRIM-999A',
      'PRIM-001B',
      'PRIME-001',
      'PRIME-0001',
      'PRIM001',
    ];
    const ids = source.map(() => randomUUID());
    for (let i = 0; i < source.length; i++)
      await db.$executeRawUnsafe(
        `INSERT INTO "${schema}"."Membership" (id,number) VALUES ($1::uuid,$2)`,
        ids[i],
        source[i],
      );
    const vehicleId = randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO "${schema}"."Vehicle" VALUES ($1::uuid,$2::uuid)`,
      vehicleId,
      ids[0],
    );
    const migration = readFileSync(
      'prisma/migrations/20261030050000_v2_prime_numbering/migration.sql',
      'utf8',
    )
      .replace(/^BEGIN;/, '')
      .replace(/COMMIT;\s*$/, '');
    // Prisma executeRaw supports individual statements; use pg's simple protocol via local psql container for the migration.
    const { execFileSync } = await import('node:child_process');
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        'primax-v2-local-test',
        'psql',
        '-U',
        'primax_v2',
        '-d',
        'primax_v2_test',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      {
        input: `BEGIN; SET LOCAL search_path TO "${schema}";\n${migration}\nCOMMIT;`,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const migrated = await db.$queryRawUnsafe<
      { id: string; number: string; balance: unknown }[]
    >(`SELECT * FROM "${schema}"."Membership"`);
    expect(migrated).toHaveLength(source.length);
    expect(new Set(migrated.map((m) => m.number)).size).toBe(source.length);
    for (const row of migrated) {
      expect(ids).toContain(row.id);
      expect(row.number).toMatch(/^PRIME-[A-Z]*[0-9]{3}$/);
      expect(String(row.balance)).toBe('125.5');
    }
    expect(migrated.find((m) => m.id === ids[5])?.number).toBe('PRIME-001');
    expect(migrated.find((m) => m.id === ids[2])?.number).toBe('PRIME-A001');
    const aliases = await db.$queryRawUnsafe<
      { code: string; membershipId: string }[]
    >(`SELECT * FROM "${schema}"."MembershipCodeAlias"`);
    expect(aliases).toHaveLength(7);
    expect(aliases.find((a) => a.code === 'PRIM-001')?.membershipId).toBe(
      ids[0],
    );
    const vehicles = await db.$queryRawUnsafe<{ membershipId: string }[]>(
      `SELECT * FROM "${schema}"."Vehicle"`,
    );
    expect(vehicles[0].membershipId).toBe(ids[0]);
  });
});
