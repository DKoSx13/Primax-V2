import { Prisma } from '@prisma/client';
import { MembershipsService } from '../memberships/memberships.service';
import { MembershipsRepository } from '../memberships/memberships.repository';

describe('legacy membership finance boundary', () => {
  it.each([
    ['0', '0', '0', null, '0.00'],
    ['12.34', '5.67', '2.01', 9, '18.01'],
    ['9999999999.99', '0.01', '0', 0, '10000000000.00'],
  ])(
    'preserves full me contract and decimal strings: %s + %s',
    async (balance, reserved, pending, points, total) => {
      const membership = {
        id: 'synthetic-membership',
        number: 'SYNTHETIC',
        user: { name: 'Synthetic', email: 'fixture@example.invalid' },
        vehicles: [],
        balance: new Prisma.Decimal(balance),
        welcomeAvailable: true,
      };
      const calls: string[] = [];
      const repo = {
        findForUser: async () => membership,
        balance: async (id: string) => {
          calls.push(id);
          return { _sum: { points } };
        },
        reserved: async (id: string) => {
          calls.push(id);
          return new Prisma.Decimal(reserved);
        },
        pending: async (id: string) => {
          calls.push(id);
          return new Prisma.Decimal(pending);
        },
      };
      const result = await new MembershipsService(
        repo as unknown as MembershipsRepository,
      ).me('synthetic-user');
      expect(result).toEqual({
        ...membership,
        balance: new Prisma.Decimal(balance).toFixed(2),
        reserved: new Prisma.Decimal(reserved).toFixed(2),
        available: new Prisma.Decimal(balance).toFixed(2),
        pendingBalance: new Prisma.Decimal(pending).toFixed(2),
        total,
        points: points ?? 0,
      });
      expect(calls).toEqual(Array(3).fill(membership.id));
    },
  );
  it('does not return fabricated zeroes when Commerce projection fails', async () => {
    const repo = {
      findForUser: async () => ({
        id: 'synthetic',
        balance: new Prisma.Decimal(0),
      }),
      balance: async () => {
        throw Error('synthetic projection unavailable');
      },
    };
    await expect(
      new MembershipsService(repo as unknown as MembershipsRepository).me(
        'synthetic',
      ),
    ).rejects.toThrow('unavailable');
  });
});
