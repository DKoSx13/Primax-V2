import { Injectable } from '@nestjs/common';
import { OnlineOrdersService } from '../../../../../src/payments/online-orders';

export type ExistingOrderInputs = {
  create: Parameters<OnlineOrdersService['create']>[0];
  demo: Parameters<OnlineOrdersService['confirmDemo']>[1];
  reselect: Parameters<OnlineOrdersService['reselect']>[1];
  actor: Parameters<OnlineOrdersService['create']>[1];
  event: Parameters<OnlineOrdersService['webhook']>[0];
};
export type ExistingOrderViews = { [K in 'create' | 'confirmDemo' | 'reselect' | 'cancel' | 'refund' | 'status' | 'webhook']: Awaited<ReturnType<OnlineOrdersService[K]>> };

@Injectable()
export class ExistingOrderWorkflow {
  constructor(private readonly orders: OnlineOrdersService) {}
  create(command: ExistingOrderInputs['create'], actor: ExistingOrderInputs['actor']) { return this.orders.create(command, actor); }
  confirmDemo(id: string, command: ExistingOrderInputs['demo'], actor: ExistingOrderInputs['actor']) { return this.orders.confirmDemo(id, command, actor); }
  reselect(id: string, command: ExistingOrderInputs['reselect'], actor: ExistingOrderInputs['actor']) { return this.orders.reselect(id, command, actor); }
  cancel(id: string, actor: ExistingOrderInputs['actor']) { return this.orders.cancel(id, actor); }
  refund(id: string, actor: ExistingOrderInputs['actor']) { return this.orders.refund(id, actor); }
  status(...args: [id: string, actor?: ExistingOrderInputs['actor']]) { return this.orders.status(...args); }
  webhook(event: ExistingOrderInputs['event']) { return this.orders.webhook(event); }
}
