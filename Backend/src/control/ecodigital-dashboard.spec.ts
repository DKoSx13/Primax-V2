import { ForbiddenException } from '@nestjs/common';
import { ControlService } from './control.service';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../auth/access';

const stationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stationB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actor: Extract<Actor, { kind: 'control' }> = {
  kind: 'control', userId: stationA, role: 'ENCARGADO', global: false,
  stationIds: [stationA], permissions: ['ADMIN_DASHBOARD_VIEW', 'ADMIN_RECEIPT_VIEW'],
};

function fixture() {
  const count = jest.fn().mockResolvedValue(3);
  const db = {
    station: { findMany: jest.fn().mockResolvedValue([]) },
    transaction: { count: jest.fn().mockResolvedValue(0) },
    terminalOperation: { count: jest.fn().mockResolvedValue(0) },
    terminal: { groupBy: jest.fn().mockResolvedValue([]) },
    operationalIncident: { count: jest.fn().mockResolvedValue(0) },
    fuelInventory: { findMany: jest.fn().mockResolvedValue([]) },
    receipt: { count },
  } as unknown as PrismaService;
  return { service: new ControlService(db, {} as never, {} as never, {} as never), count };
}

describe('EcoDigital dashboard aggregate', () => {
  it('counts stored receipts issued today only within the authorized station', async () => {
    const { service, count } = fixture();
    const result = await service.dashboard(actor, stationA);
    expect(result.receiptsAvailableToday).toBe(3);
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ where: {
      issuedAt: { gte: expect.any(Date) },
      transaction: { stationId: { in: [stationA] } },
    } });
  });

  it('uses the Lima calendar day across UTC midnight', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T02:00:00.000Z'));
    try {
      const { service, count } = fixture();
      await service.dashboard(actor, stationA);
      expect(count.mock.calls[0][0].where.issuedAt.gte.toISOString()).toBe('2026-11-08T05:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('hides the count without receipt permission and rejects other stations', async () => {
    const { service, count } = fixture();
    const withoutReceipt = { ...actor, permissions: ['ADMIN_DASHBOARD_VIEW'] };
    expect((await service.dashboard(withoutReceipt, stationA)).receiptsAvailableToday).toBeNull();
    expect(count).not.toHaveBeenCalled();
    await expect(service.dashboard(actor, stationB)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
