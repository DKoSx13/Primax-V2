import type { Provider } from '@nestjs/common';
import { CONTROL_PAYMENT_WORKFLOW } from '../application/ports/control-payment-workflow';
import { ControlPaymentWorkflow } from '../application/use-cases/control-payment-workflow';
import { ControlPaymentWorkflowAdapter } from '../adapters/inbound/control-payment-workflow.adapter';
import { ExistingControlPaymentWorkflow, ExistingControlPaymentWorkflowArguments, ExistingControlPaymentWorkflowViews } from '../adapters/outbound/existing-control-payment-workflow';

export const controlPaymentWorkflowProviders: Provider[] = [
  ExistingControlPaymentWorkflow,
  { provide: CONTROL_PAYMENT_WORKFLOW, inject: [ExistingControlPaymentWorkflow],
    useFactory: (engine: ExistingControlPaymentWorkflow) => new ControlPaymentWorkflow<ExistingControlPaymentWorkflowArguments, ExistingControlPaymentWorkflowViews>(engine) },
  ControlPaymentWorkflowAdapter,
];
