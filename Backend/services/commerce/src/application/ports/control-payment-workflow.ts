/** Transport/actor tuples are supplied at composition and never interpreted here. */
export interface ControlPaymentWorkflowArguments { detail: unknown[]; act: unknown[] }
export interface ControlPaymentWorkflowViews { detail: unknown; act: unknown }
export interface ControlPaymentWorkflowPort<I extends ControlPaymentWorkflowArguments, V extends ControlPaymentWorkflowViews> {
  detail(...args: I['detail']): Promise<V['detail']>;
  act(...args: I['act']): Promise<V['act']>;
}
export const CONTROL_PAYMENT_WORKFLOW = Symbol('commerce.control-payment-workflow');
