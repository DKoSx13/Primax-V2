import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReadTransaction } from '../../services/commerce/src/application/use-cases/read-transaction';
import { LegacyTransactionRead } from '../../services/commerce/src/adapters/outbound/legacy-transaction-read';
import { transactionResponse, TransactionModel } from './transaction.model';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fixture(owner: string | null = 'owner') {
  const row = { id: 'synthetic', requestHash: 'not-public', amount: new Prisma.Decimal('50.00'), receipt: null,
    membership: owner ? { id: 'member', number: 'SYNTHETIC', userId: owner, user: { name: 'Synthetic' } } : null } as unknown as TransactionModel;
  const repo = { byId: jest.fn().mockResolvedValue(row) };
  return { row, repo, read: new ReadTransaction(new LegacyTransactionRead(repo as never)) };
}
describe('Commerce transaction read boundary', () => {
  it('preserves the existing mapper and does not expose requestHash or owner identity', async () => {
    const { row, repo, read } = fixture(); const before = JSON.stringify(row);
    const result = await read.get('synthetic', { kind: 'member', userId: 'owner' });
    expect(result).toEqual(transactionResponse(row)); expect(result).not.toHaveProperty('requestHash');
    expect(result.membership).not.toHaveProperty('userId'); expect(JSON.stringify(row)).toBe(before);
    expect(repo.byId).toHaveBeenCalledWith('synthetic'); expect(repo.byId).toHaveBeenCalledTimes(1);
  });
  it.each(['other', 'absent'])('keeps %s owner access as the same 404', async userId => {
    const { read } = fixture();
    await expect(read.get('synthetic', { kind: 'member', userId })).rejects.toMatchObject({ message: 'Transacción no encontrada', status: 404 });
  });
  it('does not make an unlinked sale visible to a member', async () => {
    const { read } = fixture(null);
    await expect(read.get('synthetic', { kind: 'member', userId: 'owner' })).rejects.toBeInstanceOf(NotFoundException);
  });
  it('preserves trusted kiosk service behavior; station authorization remains in the guard', async () => {
    const { read, row } = fixture(null);
    expect(await read.get('synthetic', { kind: 'kiosk', stationId: 'trusted-station' })).toEqual(transactionResponse(row));
  });
  it('propagates absent data and persistence failure without fallback or retry', async () => {
    const { repo, read } = fixture(); repo.byId.mockResolvedValueOnce(null);
    await expect(read.get('absent', { kind: 'kiosk' })).rejects.toBeInstanceOf(NotFoundException);
    const error = new Error('Synthetic persistence unavailable'); repo.byId.mockRejectedValueOnce(error);
    await expect(read.get('synthetic', { kind: 'member', userId: 'owner' })).rejects.toBe(error);
    expect(repo.byId).toHaveBeenCalledTimes(2);
  });
  it('keeps application independent of Nest, Prisma and HTTP', () => {
    for (const file of ['ports/transaction-read.ts', 'use-cases/read-transaction.ts'])
      expect(readFileSync(resolve('services/commerce/src/application', file), 'utf8')).not.toMatch(/@nestjs|@prisma|PrismaService|\b(fetch|axios|HttpService)\b/);
  });
});
