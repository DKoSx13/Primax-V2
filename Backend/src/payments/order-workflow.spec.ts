import { OrderWorkflow } from '../../services/commerce/src/application/use-cases/order-workflow';
import { ExistingOrderWorkflow, ExistingOrderInputs, ExistingOrderViews } from '../../services/commerce/src/adapters/outbound/existing-order-workflow';
import { OrderWorkflowAdapter } from '../../services/commerce/src/adapters/inbound/order-workflow.adapter';
import { OnlineOrdersController, OnlineOrdersService } from './online-orders';
import { PaymentWebhookController } from './webhook';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Order workflow compatibility', () => {
  it('blocks provider refund when dispensing has started by the time the refund intent is locked', async () => {
    const tx = { $queryRaw:jest.fn(), onlineOrder:{findUniqueOrThrow:jest.fn(),updateMany:jest.fn()},
      payment:{findUniqueOrThrow:jest.fn().mockResolvedValue({authorization:{dispensedAmount:{gt:()=>true}}})} };
    const order = { id:'order', operationId:'operation', paymentId:'payment', providerId:'demo:order', status:'CAPTURED' };
    tx.onlineOrder.findUniqueOrThrow.mockResolvedValue(order);
    const provider = { refund:jest.fn() };
    const db = { onlineOrder:{findUnique:jest.fn().mockResolvedValue(order)},
      atomic:(work:(client:typeof tx)=>Promise<unknown>)=>work(tx) };
    await expect(new OnlineOrdersService(db as never, provider as never).refund(order.id,{kind:'kiosk'})).rejects.toMatchObject({status:409});
    expect(tx.onlineOrder.updateMany).not.toHaveBeenCalled();
    expect(provider.refund).not.toHaveBeenCalled();
  });
  it('rejects continuation metadata on order creation and reselection before any external effect', async () => {
    const provider = { create: jest.fn(), cancel: jest.fn() };
    const db = { atomic: jest.fn(), onlineOrder: { findUnique: jest.fn() } };
    const service = new OnlineOrdersService(db as never, provider as never);
    const dto = { operationId: 'operation', method: 'YAPE', authorization: { capturedContinuation: { orderId: 'order' } } } as const;
    for (const result of [
      () => service.create(dto as never, { kind: 'kiosk' }),
      () => service.reselect('order', dto as never, { kind: 'kiosk' }),
    ]) await expect(result()).rejects.toMatchObject({ status: 400 });
    expect(db.atomic).not.toHaveBeenCalled();
    expect(db.onlineOrder.findUnique).not.toHaveBeenCalled();
    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.cancel).not.toHaveBeenCalled();
  });
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
