import type { OrderWorkflowInputs, OrderWorkflowViews, OrderWorkflowPort } from '../ports/order-workflow';

export class OrderWorkflow<I extends OrderWorkflowInputs, V extends OrderWorkflowViews> implements OrderWorkflowPort<I,V> {
  constructor(private readonly orders: OrderWorkflowPort<I,V>) {}
  create(command: I['create'], actor: I['actor']) { return this.orders.create(command, actor); }
  confirmDemo(id: string, command: I['demo'], actor: I['actor']) { return this.orders.confirmDemo(id, command, actor); }
  reselect(id: string, command: I['reselect'], actor: I['actor']) { return this.orders.reselect(id, command, actor); }
  cancel(id: string, actor: I['actor']) { return this.orders.cancel(id, actor); }
  refund(id: string, actor: I['actor']) { return this.orders.refund(id, actor); }
  status(...args: [id: string, actor?: I['actor']]) { return this.orders.status(...args); }
  webhook(event: I['event']) { return this.orders.webhook(event); }
}
