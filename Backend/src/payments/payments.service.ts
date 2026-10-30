import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma, PurchaseMode } from '@prisma/client';
import { assertDemoWallet } from './demo-provider';

export const V2_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'YAPE',
  'PLIN',
  'TARJETA',
  'SALDO_PRIME',
];
export function assertV2PaymentMethod(method: PaymentMethod | undefined) {
  if (method !== undefined && !V2_PAYMENT_METHODS.includes(method))
    throw new BadRequestException(
      'Método no permitido en V2. Usa Yape, Plin, Tarjeta o Saldo Prime.',
    );
}

/** Medios de pago externos. El prepago solo admite estos. */
export const EXTERNAL_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.TARJETA,
  PaymentMethod.YAPE,
  PaymentMethod.PLIN,
];

@Injectable()
export class PaymentsService {
  /** Card simulation requires the explicit demo profile; Prime uses its ledger.
   * Online Yape/Plin payments are created and reconciled by OnlineOrdersService.
   */
  authorize(amount: Prisma.Decimal, method: PaymentMethod, mode: PurchaseMode) {
    assertV2PaymentMethod(method);
    if (['YAPE', 'PLIN'].includes(method))
      throw new BadRequestException(
        'El pago requiere una orden confirmada por el proveedor',
      );
    if (mode === PurchaseMode.PREPAGO) {
      if (!EXTERNAL_METHODS.includes(method))
        throw new BadRequestException(
          'El prepago requiere tarjeta, Yape o Plin',
        );
    } else if (method !== PaymentMethod.SALDO_PRIME) {
      throw new BadRequestException(
        'El postpago requiere cargo al saldo Primax Prime',
      );
    }
    if (method === 'TARJETA') assertDemoWallet();
    return {
      amount,
      method,
      status: 'CAPTURED' as const,
      provider: 'DEMO',
    };
  }
}
