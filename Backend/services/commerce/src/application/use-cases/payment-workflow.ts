import type { PartialRefundObservation, PaymentWorkflowPort, PaymentWorkflowViews } from '../ports/payment-workflow';

export class PaymentWorkflow<V extends PaymentWorkflowViews> implements PaymentWorkflowPort<V> {
  constructor(private readonly payments: PaymentWorkflowPort<V>) {}
  refund(id: string) { return this.payments.refund(id); }
  inspect(id: string) { return this.payments.inspect(id); }
  report(id: string, observation: PartialRefundObservation) { return this.payments.report(id, observation); }
}
