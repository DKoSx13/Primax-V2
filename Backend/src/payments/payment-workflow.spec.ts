import { PaymentLifecycleController } from './payment-lifecycle';
import { PartialRefundController } from './partial-refund';
import { PaymentWorkflow } from '../../services/commerce/src/application/use-cases/payment-workflow';
import { ExistingPaymentWorkflow } from '../../services/commerce/src/adapters/outbound/existing-payment-workflow';
import { PaymentWorkflowAdapter } from '../../services/commerce/src/adapters/inbound/payment-workflow.adapter';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Payment workflow compatibility boundaries', () => {
  const observation = { eventId: 'synthetic', outcome: 'AMBIGUOUS' as const, amount: '40.00', reference: 'synthetic' };
  function fixture() {
    const result = { synthetic: true };
    const refund = jest.fn(async (..._args: unknown[]) => result), get = jest.fn(async (..._args: unknown[]) => result), report = jest.fn(async (..._args: unknown[]) => result);
    const adapter = new PaymentWorkflowAdapter(new PaymentWorkflow(new ExistingPaymentWorkflow({refund} as never, {get,report} as never)) as never);
    return { lifecycle: new PaymentLifecycleController(adapter), partial: new PartialRefundController(adapter), refund, get, report, result };
  }
  it.each(['refund','inspect','report'] as const)('delegates %s once, preserving results and errors without retry', async kind => {
    const f = fixture(), method = kind === 'inspect' ? f.get : f[kind];
    const invoke = () => kind === 'refund' ? f.lifecycle.refund('synthetic') : kind === 'inspect' ? f.partial.get('synthetic') : f.partial.report('synthetic', observation);
    expect(await invoke()).toBe(f.result); expect(method).toHaveBeenCalledTimes(1);
    expect(method.mock.calls[0]).toEqual(kind === 'report' ? ['synthetic', observation] : ['synthetic']);
    if(kind === 'report') expect(method.mock.calls[0][1]).toBe(observation);
    const error = Error('Synthetic outcome unknown'); method.mockRejectedValueOnce(error);
    await expect(invoke()).rejects.toBe(error); expect(method).toHaveBeenCalledTimes(2);
  });
  it('keeps the application and port independent of infrastructure', () => {
    for(const file of ['ports/payment-workflow.ts','use-cases/payment-workflow.ts'])
      expect(readFileSync(resolve('services/commerce/src/application',file),'utf8')).not.toMatch(/@nestjs|@prisma|TransactionClient|\b(fetch|axios|HttpService)\b/);
  });
});
