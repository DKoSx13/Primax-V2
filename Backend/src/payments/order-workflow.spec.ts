import { OrderWorkflow } from '../../services/commerce/src/application/use-cases/order-workflow';
import { ExistingOrderWorkflow, ExistingOrderInputs, ExistingOrderViews } from '../../services/commerce/src/adapters/outbound/existing-order-workflow';
import { OrderWorkflowAdapter } from '../../services/commerce/src/adapters/inbound/order-workflow.adapter';
import { OnlineOrdersController } from './online-orders';
import { PaymentWebhookController } from './webhook';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Order workflow compatibility', () => {
  const names = ['create','confirmDemo','reselect','cancel','refund','status','webhook'] as const;
  it.each(names)('forwards %s once without cloning, retries or translated errors', async name => {
    const value = { synthetic: true }, engine = Object.fromEntries(names.map(k => [k,jest.fn(async (..._args: unknown[]) => value)]));
    const adapter = new OrderWorkflowAdapter(new OrderWorkflow<ExistingOrderInputs,ExistingOrderViews>(new ExistingOrderWorkflow(engine as never)));
    const args: unknown[] = name === 'webhook' ? [{synthetic:'event'}] : name === 'create' ? [{synthetic:'dto'},{kind:'kiosk'}] :
      ['confirmDemo','reselect'].includes(name) ? ['id',{synthetic:'dto'},{kind:'kiosk'}] : name === 'status' ? ['id'] : ['id',{kind:'member'}];
    const invoke = () => (adapter[name] as (...args: unknown[]) => Promise<unknown>)(...args);
    expect(await invoke()).toBe(value); expect(engine[name]).toHaveBeenCalledTimes(1);
    expect(engine[name].mock.calls[0]).toEqual(args); args.forEach((v,i) => expect(engine[name].mock.calls[0][i]).toBe(v));
    const error=Error('Synthetic outcome unknown'); engine[name].mockRejectedValueOnce(error);
    await expect(invoke()).rejects.toBe(error); expect(engine[name]).toHaveBeenCalledTimes(2);
  });
  it('keeps both callback secrets in the original controller before dispatch', () => {
    const original=process.env.PAYMENT_WEBHOOK_SECRET;
    try {
      process.env.PAYMENT_WEBHOOK_SECRET='synthetic-unit-only';
      const engine={status:jest.fn(),webhook:jest.fn()}, adapter=engine as unknown as OrderWorkflowAdapter;
      const orders=new OnlineOrdersController(adapter), webhook=new PaymentWebhookController(adapter);
      const event={eventId:'synthetic',orderId:'id',type:'PAID'};
      expect(()=>orders.notify('id','wrong')).toThrow();expect(()=>webhook.receive(event,'wrong')).toThrow();
      expect(engine.status).not.toHaveBeenCalled();expect(engine.webhook).not.toHaveBeenCalled();
      orders.notify('id','synthetic-unit-only');webhook.receive(event,'synthetic-unit-only');
      expect(engine.status).toHaveBeenCalledWith('id');expect(engine.webhook).toHaveBeenCalledWith(event);
    } finally { if(original===undefined)delete process.env.PAYMENT_WEBHOOK_SECRET;else process.env.PAYMENT_WEBHOOK_SECRET=original; }
  });
  it('keeps application/port free of infrastructure imports', () => {
    for(const file of ['ports/order-workflow.ts','use-cases/order-workflow.ts'])
      expect(readFileSync(resolve('services/commerce/src/application',file),'utf8')).not.toMatch(/@nestjs|@prisma|\b(fetch|axios|HttpService)\b/);
  });
});
