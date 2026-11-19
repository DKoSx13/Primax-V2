import request from 'supertest';
import { Prisma } from '@prisma/client';
import { lotRFixture } from '../../test/identity-lot-r.fixture';
import { LegacyMembershipReads, LegacyMemberViews } from '../../services/identity/src/adapters/outbound/legacy-membership-reads';
import { MembershipReads } from '../../services/identity/src/application/use-cases/membership-reads';
import { MembershipReadsAdapter } from '../../services/identity/src/adapters/inbound/membership-reads.adapter';
import { MembershipsService } from './memberships.service';
import { MembershipsRepository } from './memberships.repository';
import { PrismaService } from '../prisma/prisma.service';

const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const absent = '33333333-3333-4333-8333-333333333333';
const stamp = new Date('2026-01-01T00:00:00Z');
function fixture() {
  const trace: string[] = [];
  const membership = (userId: string) => ({ id: userId, userId, number: 'SYNTHETIC', status: 'ACTIVE',
    balance: new Prisma.Decimal('12.34'), user: { name: 'Synthetic' }, vehicles: [], welcomeAvailable: true });
  const history = (id: string) => ({ id, membershipId: id, amount: new Prisma.Decimal('10.00'), requestHash: 'synthetic',
    membership: { id, number: 'SYNTHETIC', user: { name: 'Synthetic' } }, receipt: null, createdAt: stamp });
  const db = {
    user: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, active: true, authVersion: 0 })) },
    membership: { findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => { trace.push('membership'); return where.userId === absent ? null : membership(where.userId); }) },
    rewardMovement: { aggregate: jest.fn(async () => { trace.push('points'); return { _sum: { points: 9 } }; }),
      findMany: jest.fn(async ({ where }: { where: { membershipId: string } }) => [{ id: where.membershipId, points: 9, createdAt: stamp }]) },
    fuelAuthorization: { findMany: jest.fn(async () => { trace.push('reserved'); return [{ reservedAmount: new Prisma.Decimal('4.25') }]; }) },
    membershipDebt: { aggregate: jest.fn(async () => { trace.push('debt'); return { _sum: { amountPending: new Prisma.Decimal('3.00') } }; }) },
    transaction: { findMany: jest.fn(async ({ where }: { where: { membershipId: string } }) => [history(where.membershipId)]) },
    redemption: { findMany: jest.fn(async ({ where }: { where: { membershipId: string } }) => [{ id: where.membershipId, pointsSpent: 2, benefit: { title: 'Synthetic' } }]) },
    vehicle: { findUnique: jest.fn(async ({ where }: { where: { plate: string } }) => where.plate === 'ZZZ-999' ? null : ({
      id: a, plate: 'AAA-001', label: 'Synthetic', membership: { ...membership(a), codeAliases: [{ code: 'OLD-A' }],
        dni: null, ruc: null, businessName: null, debts: [{ amountPending: new Prisma.Decimal('3.00') }] },
    })) },
  };
  const repo = new MembershipsRepository(db as unknown as PrismaService);
  const source = new LegacyMembershipReads(repo);
  return { db, trace, repo, source, reads: new MembershipReadsAdapter(new MembershipReads<LegacyMemberViews>(source)) };
}

it('preserves me sequence, snapshot, representation and the exact legacy reservation filter', async () => {
  const f = fixture(); const result = await f.reads.me(a);
  expect(f.trace).toEqual(['membership', 'points', 'reserved', 'debt']);
  expect(result).toMatchObject({ userId: a, welcomeAvailable: true, balance: '12.34', reserved: '4.25', available: '12.34', total: '16.59', pendingBalance: '3.00', points: 9 });
  expect(f.db.fuelAuthorization.findMany).toHaveBeenCalledWith({ where: { membershipId: a, status: { in: ['RESERVED', 'DISPENSING'] } }, select: { reservedAmount: true } });
});

it.each(['transactions', 'rewards', 'redemptions'] as const)('preserves own membership resolution and ordering for %s', async method => {
  const f = fixture(), page = { page: 2, limit: 1 };
  const rows = await f.reads[method](a, page);
  const model = method === 'transactions' ? f.db.transaction : method === 'rewards' ? f.db.rewardMovement : f.db.redemption;
  expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { membershipId: a }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, skip: 1 }));
  if (method === 'transactions') { expect(rows[0]).not.toHaveProperty('requestHash'); expect(rows[0]).toHaveProperty('amount', '10.00'); }
  expect(f.trace).toEqual(['membership']);
});

it.each(['me', 'transactions', 'rewards', 'redemptions'] as const)('keeps 404 before financial lookup for missing membership: %s', async method => {
  const f = fixture(); await expect(f.reads[method](absent, { page: 1, limit: 20 })).rejects.toThrow('Membresía no encontrada');
  expect(f.trace).toEqual(['membership']);
});

it('keeps updateProfile commit then me read failure behavior, with mocks and no extra write/retry', async () => {
  const f = fixture(); const update = jest.spyOn(f.repo, 'updateProfile').mockResolvedValue({} as never);
  f.db.rewardMovement.aggregate.mockRejectedValueOnce(new Error('Synthetic financial read unavailable'));
  await expect(new MembershipsService(f.repo, f.reads).updateProfile(a, {})).rejects.toThrow('unavailable');
  expect(update).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledWith(a, {});
  expect(f.trace).toEqual(['membership', 'membership']);
});

it('propagates all four port results/errors without transformation', async () => {
  const error = new Error('Synthetic dependency failure');
  const source = { me: jest.fn(async () => ({ sentinel: true })), transactions: jest.fn(async () => []),
    rewards: jest.fn(async () => []), redemptions: jest.fn(async () => []) };
  const query = new MembershipReads(source);
  for (const method of ['me', 'transactions', 'rewards', 'redemptions'] as const) {
    await query[method](a, { page: 1, limit: 20 });
    source[method].mockRejectedValueOnce(error);
    await expect(query[method](a, { page: 1, limit: 20 })).rejects.toBe(error);
  }
});

describe('five real HTTP contracts with mocked read storage and real JWT/guard', () => {
  const f = fixture(); let app: Awaited<ReturnType<typeof lotRFixture>>;
  beforeAll(async () => { app = await lotRFixture(f.db as unknown as PrismaService, false); });
  afterAll(async () => { await app.app.close(); });
  const paths = ['memberships/me', 'memberships/me/transactions', 'memberships/me/rewards', 'memberships/me/redemptions', 'vehicles/AAA-001'];
  it.each(paths)('%s retains 401 without/invalid/expired auth', async path => {
    for (const token of ['', 'synthetic-invalid', await app.jwt.signAsync({ sub: a }, { expiresIn: -1 })]) {
      const req = request(app.app.getHttpServer()).get('/api/v1/' + path);
      if (token) req.set('Authorization', 'Bearer ' + token); await req.expect(401);
    }
  });
  it.each(paths)('%s accepts own authenticated read without exposing requestHash', async path => {
    const response = await request(app.app.getHttpServer()).get('/api/v1/' + path).set('Authorization', 'Bearer ' + await app.token(a)).expect(200);
    expect(JSON.stringify(response.body)).not.toContain('requestHash');
  });
  it.each(['transactions', 'rewards', 'redemptions'])('%s retains filters validation and owner from actor', async method => {
    await request(app.app.getHttpServer()).get('/api/v1/memberships/me/' + method + '?userId=' + b).set('Authorization', 'Bearer ' + await app.token(a)).expect(400);
    const r = await request(app.app.getHttpServer()).get('/api/v1/memberships/me/' + method).set('Authorization', 'Bearer ' + await app.token(b)).expect(200);
    expect(r.body[0].id).toBe(b);
  });
  it('keeps plate normalization, foreign/missing 404 and invalid 400', async () => {
    const auth = 'Bearer ' + await app.token(a);
    await request(app.app.getHttpServer()).get('/api/v1/vehicles/aaa001').set('Authorization', auth).expect(200);
    await request(app.app.getHttpServer()).get('/api/v1/vehicles/AAA-001').set('Authorization', 'Bearer ' + await app.token(b)).expect(404);
    await request(app.app.getHttpServer()).get('/api/v1/vehicles/ZZZ-999').set('Authorization', auth).expect(404);
    await request(app.app.getHttpServer()).get('/api/v1/vehicles/invalid').set('Authorization', auth).expect(400);
  });
});
