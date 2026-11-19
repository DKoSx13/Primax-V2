import { ControlOperationRecovery } from '../../services/commerce/src/application/use-cases/control-operation-recovery';
import { ControlOperationRecoveryAdapter } from '../../services/commerce/src/adapters/inbound/control-operation-recovery.adapter';
import { ExistingControlOperationRecovery, ExistingControlOperationRecoveryArguments, ExistingControlOperationRecoveryViews } from '../../services/commerce/src/adapters/outbound/existing-control-operation-recovery';
import { readFileSync } from 'node:fs';

describe('ControlOperationRecovery exact original invocation', () => {
  it.each(["issueRecoveryTicket","resolveOperation","cancelUnpaidOperation"])('preserves argument identity, arity, result and unknown rejection: %s', async method => {
    const result = { synthetic: true }, error = Error('Unknown outcome');
    const engine = Object.fromEntries(["issueRecoveryTicket","resolveOperation","cancelUnpaidOperation"].map(m => [m, jest.fn(async (..._args: unknown[]) => result)]));
    const adapter = new ControlOperationRecoveryAdapter(new ControlOperationRecovery<ExistingControlOperationRecoveryArguments, ExistingControlOperationRecoveryViews>(new ExistingControlOperationRecovery(engine as never, engine as never)));
    const args = [{ synthetic: 'actor or request' }, 'id', { synthetic: 'command' }];
    const invoke = () => (adapter[method as keyof typeof adapter] as (...args: unknown[]) => unknown)(...args);
    expect(await invoke()).toBe(result); expect(engine[method]).toHaveBeenCalledTimes(1);
    expect(engine[method].mock.calls[0]).toEqual(args); args.forEach((a, i) => expect(engine[method].mock.calls[0][i]).toBe(a));
    engine[method].mockRejectedValueOnce(error); await expect(invoke()).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
  });
  it('keeps ports and application pure', () => {
    for (const dir of ['ports', 'use-cases']) expect(readFileSync('services/commerce/src/application/'+dir+'/control-operation-recovery.ts','utf8')).not.toMatch(/@nestjs|@prisma|TransactionClient|Request\b|Response\b|\b(fetch|axios|HttpService)\b/);
  });
});
