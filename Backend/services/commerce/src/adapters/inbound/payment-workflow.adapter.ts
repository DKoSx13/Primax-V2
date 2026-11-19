import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_WORKFLOW } from '../../application/ports/payment-workflow';
import type { PartialRefundObservation, PaymentWorkflowPort } from '../../application/ports/payment-workflow';
import type { ExistingPaymentViews } from '../outbound/existing-payment-workflow';

@Injectable()
export class PaymentWorkflowAdapter {
  constructor(@Inject(PAYMENT_WORKFLOW) private readonly payments: PaymentWorkflowPort<ExistingPaymentViews>) {}
  refund(id: string) { return this.payments.refund(id); }
  inspect(id: string) { return this.payments.inspect(id); }
  report(id: string, observation: PartialRefundObservation) { return this.payments.report(id, observation); }
}
