import { Injectable } from '@nestjs/common';
import { PaymentLifecycleService } from '../../../../../src/payments/payment-lifecycle';
import { PartialRefundService } from '../../../../../src/payments/partial-refund';
import type { PartialRefundObservation } from '../../application/ports/payment-workflow';

@Injectable()
export class ExistingPaymentWorkflow {
  constructor(private readonly lifecycle: PaymentLifecycleService, private readonly partial: PartialRefundService) {}
  refund(id: string) { return this.lifecycle.refund(id); }
  inspect(id: string) { return this.partial.get(id); }
  report(id: string, observation: PartialRefundObservation) { return this.partial.report(id, observation); }
}
export type ExistingPaymentViews = {
  refund: Awaited<ReturnType<PaymentLifecycleService['refund']>>;
  inspect: Awaited<ReturnType<PartialRefundService['get']>>;
  report: Awaited<ReturnType<PartialRefundService['report']>>;
};
