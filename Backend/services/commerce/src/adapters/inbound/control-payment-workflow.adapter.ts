import { Inject, Injectable } from '@nestjs/common';
import { CONTROL_PAYMENT_WORKFLOW } from '../../application/ports/control-payment-workflow';
import type { ControlPaymentWorkflowPort } from '../../application/ports/control-payment-workflow';
import type { ExistingControlPaymentWorkflowArguments, ExistingControlPaymentWorkflowViews } from '../outbound/existing-control-payment-workflow';

@Injectable()
export class ControlPaymentWorkflowAdapter {
  constructor(@Inject(CONTROL_PAYMENT_WORKFLOW) private readonly engine: ControlPaymentWorkflowPort<ExistingControlPaymentWorkflowArguments, ExistingControlPaymentWorkflowViews>) {}
  detail(...args: ExistingControlPaymentWorkflowArguments['detail']) { return this.engine.detail(...args); }
  act(...args: ExistingControlPaymentWorkflowArguments['act']) { return this.engine.act(...args); }
}
