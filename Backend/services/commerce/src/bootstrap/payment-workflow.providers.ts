import type { Provider } from '@nestjs/common';
import { PAYMENT_WORKFLOW } from '../application/ports/payment-workflow';
import { PaymentWorkflow } from '../application/use-cases/payment-workflow';
import { PaymentWorkflowAdapter } from '../adapters/inbound/payment-workflow.adapter';
import { ExistingPaymentWorkflow, ExistingPaymentViews } from '../adapters/outbound/existing-payment-workflow';

export const paymentWorkflowProviders: Provider[] = [
  ExistingPaymentWorkflow,
  { provide: PAYMENT_WORKFLOW, inject: [ExistingPaymentWorkflow],
    useFactory: (payments: ExistingPaymentWorkflow) => new PaymentWorkflow<ExistingPaymentViews>(payments) },
  PaymentWorkflowAdapter,
];
