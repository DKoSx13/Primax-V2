import { Inject, Injectable } from '@nestjs/common';
import { ORDER_WORKFLOW } from '../../application/ports/order-workflow';
import type { OrderWorkflowPort } from '../../application/ports/order-workflow';
import type { ExistingOrderInputs, ExistingOrderViews } from '../outbound/existing-order-workflow';

@Injectable()
export class OrderWorkflowAdapter {
  constructor(@Inject(ORDER_WORKFLOW) private readonly orders: OrderWorkflowPort<ExistingOrderInputs,ExistingOrderViews>) {}
  create(command: ExistingOrderInputs['create'], actor: ExistingOrderInputs['actor']) { return this.orders.create(command, actor); }
  confirmDemo(id: string, command: ExistingOrderInputs['demo'], actor: ExistingOrderInputs['actor']) { return this.orders.confirmDemo(id, command, actor); }
  reselect(id: string, command: ExistingOrderInputs['reselect'], actor: ExistingOrderInputs['actor']) { return this.orders.reselect(id, command, actor); }
  cancel(id: string, actor: ExistingOrderInputs['actor']) { return this.orders.cancel(id, actor); }
  refund(id: string, actor: ExistingOrderInputs['actor']) { return this.orders.refund(id, actor); }
  status(...args: [id: string, actor?: ExistingOrderInputs['actor']]) { return this.orders.status(...args); }
  webhook(event: ExistingOrderInputs['event']) { return this.orders.webhook(event); }
}
