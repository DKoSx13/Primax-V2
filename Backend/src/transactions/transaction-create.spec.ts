import { CreateTransactionDto } from './create-transaction.dto';
import { TransactionsController } from './transactions.controller';
import { CreateTransaction } from '../../services/commerce/src/application/use-cases/create-transaction';
import { ExistingTransactionCreation } from '../../services/commerce/src/adapters/outbound/existing-transaction-creation';
import { TransactionCreationAdapter } from '../../services/commerce/src/adapters/inbound/transaction-creation.adapter';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Sale creation boundary preserves the engine and pre-hook', () => {
  const input = Object.assign(new CreateTransactionDto(), { operationId: 'synthetic', plate: 'AAA-001', amount: '50.00',
    stationId: 'station', fuelId: 'fuel', mode: 'POSTPAGO' as const, paymentMethod: 'SALDO_PRIME' as const,
    authorizationId: 'authorization', saveReceiptProfile: true, receiptDni: '00000000' });
  function fixture() {
    const events: string[] = [], result = { transaction: { id: 'synthetic' }, replayed: false };
    const engine = { create: jest.fn(async (_input: CreateTransactionDto) => { events.push('engine'); return result; }) };
    const alerts = { checkAuthorization: jest.fn(async () => { events.push('alert'); }) };
    const adapter = new TransactionCreationAdapter(new CreateTransaction(new ExistingTransactionCreation(engine as never)) as never);
    const controller = new TransactionsController(engine as never, alerts as never, adapter);
    return { controller, engine, alerts, events, result };
  }
  it('awaits the original alert then invokes the original engine exactly once with the same DTO', async () => {
    const f = fixture(); expect(await f.controller.create(input)).toBe(f.result);
    expect(f.events).toEqual(['alert', 'engine']); expect(f.engine.create).toHaveBeenCalledTimes(1);
    expect(f.engine.create.mock.calls[0][0]).toBe(input);
    expect(f.alerts.checkAuthorization).toHaveBeenCalledWith(input.plate, input.authorizationId, input.operationId);
  });
  it('preserves a rejected pre-hook without invoking the engine', async () => {
    const f = fixture(), error = Error('Synthetic pre-hook failure'); f.alerts.checkAuthorization.mockRejectedValueOnce(error);
    await expect(f.controller.create(input)).rejects.toBe(error); expect(f.engine.create).not.toHaveBeenCalled();
  });
  it('propagates an unknown engine outcome without retrying or compensating', async () => {
    const f = fixture(), error = Error('Synthetic transport outcome unknown'); f.engine.create.mockRejectedValueOnce(error);
    await expect(f.controller.create(input)).rejects.toBe(error); expect(f.engine.create).toHaveBeenCalledTimes(1);
    expect(f.events).toEqual(['alert']);
  });
  it('does not introduce the POSTPAGO alert into PREPAGO', async () => {
    const f = fixture(); await f.controller.create({ ...input, mode: 'PREPAGO', paymentMethod: 'TARJETA' });
    expect(f.alerts.checkAuthorization).not.toHaveBeenCalled(); expect(f.engine.create).toHaveBeenCalledTimes(1);
  });
  it('keeps application ports and use case independent of framework and persistence', () => {
    for (const file of ['ports/transaction-creation.ts', 'use-cases/create-transaction.ts'])
      expect(readFileSync(resolve('services/commerce/src/application', file), 'utf8')).not.toMatch(/@nestjs|@prisma|TransactionClient|Request\b|Response\b|\b(fetch|axios|HttpService)\b/);
  });
});
