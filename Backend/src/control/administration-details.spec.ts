import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdministrativeDetails } from '../../services/administration/src/application/use-cases/administrative-details';
import { LegacyAdministrativeDetails, LegacyAdministrativeDetailViews } from '../../services/administration/src/adapters/outbound/legacy-administrative-details';
import type { AdministrativeActor } from '../../services/administration/src/application/ports/administrative-lists';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actor: AdministrativeActor = { kind: 'control', userId: 'synthetic', role: 'ENCARGADO',
  permissions: ['ADMIN_CUSTOMER_VIEW', 'ADMIN_MEMBERSHIP_VIEW', 'ADMIN_RECEIPT_VIEW', 'ADMIN_TRANSACTION_VIEW'], stationIds: [A], global: false };
const decimal = (v: string) => new Prisma.Decimal(v);
function fixture() {
  const row = { id: 'synthetic-sale', stationId: A, receipt: null, receiptType: 'BOLETA', receiptDni: '',
    station: { name: 'Synthetic' }, fuel: { name: 'Synthetic' }, plate: 'AAA-001', gallons: decimal('2.500'), unitPrice: decimal('20'),
    amount: decimal('50'), originalAmount: null, discountAmount: decimal('0'), status: 'PAID', payment: { method: 'SALDO_PRIME', status: 'CAPTURED' },
    mode: 'POSTPAGO', createdAt: new Date('2026-01-01'), debt: null };
  const db = { transaction: { findUnique: jest.fn().mockResolvedValue(row) },
    membership: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null) } };
  const source = new LegacyAdministrativeDetails(db as never);
  return { row, db, application: new AdministrativeDetails<LegacyAdministrativeDetailViews>(source) };
}

describe('Administration detail boundaries and preserved errors', () => {
  it.each(['customer', 'membership'] as const)('rejects %s without permission before querying', async method => {
    const { application, db } = fixture();
    await expect(application[method]({ ...actor, permissions: [] }, 'synthetic')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.membership.findFirst).not.toHaveBeenCalled(); expect(db.membership.findUnique).not.toHaveBeenCalled();
  });
  it.each(['customer', 'membership'] as const)('keeps absent %s as 404 and rejects missing assignments', async method => {
    const { application } = fixture();
    await expect(application[method](actor, 'synthetic')).rejects.toBeInstanceOf(NotFoundException);
    await expect(application[method]({ ...actor, stationIds: [] }, 'synthetic')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['transaction', 'receipt'] as const)('keeps %s resource lookup/error order and foreign station rejection', async method => {
    const { application, db, row } = fixture();
    row.stationId = B;
    await expect(application[method](actor, row.id)).rejects.toBeInstanceOf(ForbiddenException);
    db.transaction.findUnique.mockResolvedValueOnce(null);
    await expect(application[method]({ ...actor, permissions: [] }, 'absent')).rejects.toBeInstanceOf(NotFoundException);
    await expect(application[method]({ ...actor, permissions: [] }, row.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('propagates persistence failure without a less restrictive retry', async () => {
    const { application, db } = fixture(); const error = Error('Synthetic persistence failure');
    db.transaction.findUnique.mockRejectedValueOnce(error);
    await expect(application.receipt(actor, 'synthetic')).rejects.toBe(error);
    expect(db.transaction.findUnique).toHaveBeenCalledTimes(1);
  });
  it('preserves receipt conflict without emitting or mutating data', async () => {
    const { application, row } = fixture(); row.gallons = decimal('0');
    await expect(application.receipt(actor, row.id)).rejects.toBeInstanceOf(ConflictException);
    expect(row.gallons.toFixed(3)).toBe('0.000');
  });
  it.each([
    ['CAPTURED', 'Pagado'], ['REFUNDED', 'Reembolsado'], ['CANCELLED', 'Cancelado'],
    ['REJECTED', 'Rechazado'], ['ERROR', 'Error de pago'], ['PARTIAL', 'Saldo pendiente'], ['PENDING', 'Pago pendiente'],
  ])('keeps receipt representation for %s', async (payment, state) => {
    const { application, row } = fixture(); row.payment.status = payment;
    const before = JSON.stringify(row); const result = await application.receipt(actor, row.id);
    expect(result).toMatchObject({ schemaVersion: 2, demo: true, state, total: '50.00', gallons: '2.500', pending: '0.00', number: null });
    expect(JSON.stringify(row)).toBe(before);
  });
  it('keeps detail application independent of framework and persistence', () => {
    for (const file of ['ports/administrative-details.ts', 'use-cases/administrative-details.ts'])
      expect(readFileSync(resolve('services/administration/src/application', file), 'utf8')).not.toMatch(/@nestjs|@prisma|PrismaService|\b(fetch|axios|HttpService)\b/);
  });
});
