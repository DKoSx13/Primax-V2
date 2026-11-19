/** Validation and defaults remain in the existing transport DTO. */
export interface PartialRefundObservation {
  eventId: string;
  outcome: 'CONFIRMED' | 'REJECTED' | 'AMBIGUOUS';
  amount: string;
  reference: string;
}
export interface PaymentWorkflowViews { refund: unknown; inspect: unknown; report: unknown }
export interface PaymentWorkflowPort<V extends PaymentWorkflowViews> {
  refund(id: string): Promise<V['refund']>;
  inspect(id: string): Promise<V['inspect']>;
  report(id: string, observation: PartialRefundObservation): Promise<V['report']>;
}
export const PAYMENT_WORKFLOW = Symbol('commerce.payment-workflow');
