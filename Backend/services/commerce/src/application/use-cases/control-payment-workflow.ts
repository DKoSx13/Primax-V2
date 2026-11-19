import type { ControlPaymentWorkflowPort, ControlPaymentWorkflowArguments, ControlPaymentWorkflowViews } from '../ports/control-payment-workflow';

export class ControlPaymentWorkflow<I extends ControlPaymentWorkflowArguments, V extends ControlPaymentWorkflowViews> implements ControlPaymentWorkflowPort<I, V> {
  constructor(private readonly engine: ControlPaymentWorkflowPort<I, V>) {}
  detail(...args: I['detail']) { return this.engine.detail(...args); }
  act(...args: I['act']) { return this.engine.act(...args); }
}
