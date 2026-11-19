import { Injectable } from '@nestjs/common';
import { ControlPaymentsService } from '../../../../../src/operations/control-payments';
import type { ControlPaymentWorkflowPort } from '../../application/ports/control-payment-workflow';

export type ExistingControlPaymentWorkflowArguments = {
  detail: Parameters<ControlPaymentsService['detail']>;
  act: Parameters<ControlPaymentsService['act']>;
};
export type ExistingControlPaymentWorkflowViews = {
  detail: Awaited<ReturnType<ControlPaymentsService['detail']>>;
  act: Awaited<ReturnType<ControlPaymentsService['act']>>;
};

@Injectable()
export class ExistingControlPaymentWorkflow implements ControlPaymentWorkflowPort<ExistingControlPaymentWorkflowArguments, ExistingControlPaymentWorkflowViews> {
  constructor(private readonly payments: ControlPaymentsService) {}
  detail(...args: ExistingControlPaymentWorkflowArguments['detail']) { return this.payments.detail(...args); }
  act(...args: ExistingControlPaymentWorkflowArguments['act']) { return this.payments.act(...args); }
}
