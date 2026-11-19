import { AuthorizationsController } from './authorizations.controller';
import { CreateAuthorizationDto } from './create-authorization.dto';
import { AuthorizationCommands } from '../../services/commerce/src/application/use-cases/authorization-commands';
import { ExistingAuthorizationCommands } from '../../services/commerce/src/adapters/outbound/existing-authorization-commands';
import { AuthorizationCommandsAdapter } from '../../services/commerce/src/adapters/inbound/authorization-commands.adapter';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Authorization command family preserves original invocation', () => {
  const input = Object.assign(new CreateAuthorizationDto(), { operationId: 'synthetic', plate: 'AAA-001', amount: '100.00',
    stationId: 'synthetic', fuelId: 'synthetic', membershipCode: 'LAB-TEST' });
  function fixture() {
    const events: string[] = [], result = { synthetic: true };
    const engine = Object.fromEntries(['create','progress','release','intervention'].map(k => [k, jest.fn(async (..._args: unknown[]) => { events.push(k); return result; })]));
    const alerts = { checkPlate: jest.fn(async () => { events.push('alert'); }) };
    const adapter = new AuthorizationCommandsAdapter(new AuthorizationCommands(new ExistingAuthorizationCommands(engine as never)) as never);
    return { controller: new AuthorizationsController(engine as never, alerts as never, adapter), events, engine, alerts, result };
  }
  it('awaits the existing alert for default POSTPAGO and forwards the exact DTO once', async () => {
    const f = fixture(); expect(await f.controller.create(input)).toBe(f.result);
    expect(f.events).toEqual(['alert','create']); expect(f.engine.create).toHaveBeenCalledTimes(1);
    expect(f.engine.create.mock.calls[0][0]).toBe(input);
  });
  it('does not introduce a plate alert into PREPAGO', async () => {
    const f = fixture(); await f.controller.create({ ...input, mode: 'PREPAGO' });
    expect(f.alerts.checkPlate).not.toHaveBeenCalled(); expect(f.engine.create).toHaveBeenCalledTimes(1);
  });
  it('preserves a rejected pre-hook without calling the engine', async () => {
    const f = fixture(), error = Error('Synthetic pre-hook rejection'); f.alerts.checkPlate.mockRejectedValueOnce(error);
    await expect(f.controller.create(input)).rejects.toBe(error); expect(f.engine.create).not.toHaveBeenCalled();
  });
  it.each(['progress','release','intervention'] as const)('forwards %s without extra effects or retries', async method => {
    const f = fixture(), dto = { amount: '20.00', gallons: '1.000' };
    const invoke = () => method === 'progress' ? f.controller.progress('synthetic-id', dto) : f.controller[method]('synthetic-id');
    expect(await invoke()).toBe(f.result); expect(f.engine[method]).toHaveBeenCalledTimes(1);
    expect(f.engine[method].mock.calls[0]).toEqual(method === 'progress' ? ['synthetic-id', dto] : ['synthetic-id']);
    const error = Error('Synthetic unknown outcome'); f.engine[method].mockRejectedValueOnce(error);
    await expect(invoke()).rejects.toBe(error); expect(f.engine[method]).toHaveBeenCalledTimes(2);
    expect(f.alerts.checkPlate).not.toHaveBeenCalled();
  });
  it('does not wrap or retry a creation error', async () => {
    const f = fixture(), error = Error('Synthetic unknown payment result'); f.engine.create.mockRejectedValueOnce(error);
    await expect(f.controller.create(input)).rejects.toBe(error); expect(f.engine.create).toHaveBeenCalledTimes(1);
  });
  it('keeps application pure', () => {
    for (const file of ['ports/authorization-commands.ts','use-cases/authorization-commands.ts'])
      expect(readFileSync(resolve('services/commerce/src/application',file),'utf8')).not.toMatch(/@nestjs|@prisma|TransactionClient|Request\b|Response\b|\b(fetch|axios|HttpService)\b/);
  });
});
