import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { CapturedContinuationCommand, AuthorizationCreationCommand } from '../../services/commerce/src/application/ports/authorization-commands';
import { normalizePlate } from '../vehicles/plate.dto';
import { terminalOperationFor, assertAuthorizationContext } from './operational-context';

/** Admission only, inside the ordinary authorization's existing serializable unit.
 * No provider calls, stock writes, new transaction boundaries or financial retries.
 * Ordinary AccessGuard/KioskService must already have authenticated the owner.
 */
export async function assertCapturedContinuation(
  tx: Prisma.TransactionClient, dto: AuthorizationCreationCommand, request: CapturedContinuationCommand,
) {
  const reject = () => { throw new ConflictException('No se puede continuar este pago; conserva la operación y solicita asistencia'); };
  if (dto.mode !== 'PREPAGO' || !['YAPE', 'PLIN'].includes(dto.paymentMethod || '') || request.currency !== 'PEN') reject();
  const operation = await terminalOperationFor(tx, dto.operationId, dto.stationId);
  if (!operation) return reject();
  const [order, payment, reservation, auth, sale, station, fuel] = await Promise.all([
    tx.onlineOrder.findUnique({ where: { id: request.orderId } }),
    tx.payment.findUnique({ where: { id: request.paymentId } }),
    tx.inventoryReservation.findUnique({ where: { operationId: dto.operationId } }),
    tx.fuelAuthorization.findUnique({ where: { operationId: dto.operationId } }),
    tx.transaction.findFirst({ where: { OR: [{ operationId: dto.operationId }, { terminalOperationId: operation.id }] } }),
    tx.station.findUnique({ where: { id: dto.stationId } }), tx.fuel.findUnique({ where: { id: dto.fuelId } }),
  ]);
  if (!order || !payment || !reservation || sale || !station?.active || !fuel?.active) return reject();
  if (order.operationId !== dto.operationId || payment.operationId !== dto.operationId || order.paymentId !== payment.id ||
      order.userId || order.transactionId || payment.transactionId || order.status !== 'CAPTURED' || payment.status !== 'CAPTURED' ||
      order.method !== dto.paymentMethod || payment.method !== dto.paymentMethod || !payment.amount.eq(order.amount) ||
      !payment.amount.eq(request.amount) || !payment.amount.gt(0) || !payment.refundedAmount.isZero() ||
      !(payment.originalAmount ?? payment.amount).eq(dto.amount) || !payment.unitPrice?.eq(dto.unitPrice || '0') ||
      !payment.unitPrice.eq(fuel.pricePerGallon)) return reject();
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const requestHash = hash({ ...dto, plate: normalizePlate(dto.plate), amount: new Prisma.Decimal(dto.amount).toFixed(2) });
  if (order.requestHash.trim() !== hash({ operationId: dto.operationId, method: dto.paymentMethod, authorization: dto }) ||
      payment.requestHash?.trim() !== requestHash || reservation.requestHash.trim() !== requestHash ||
      reservation.stationId !== dto.stationId || reservation.fuelId !== dto.fuelId ||
      reservation.source !== 'TERMINAL' || reservation.terminalOperationId !== operation.id || reservation.transactionId ||
      !reservation.consumedLiters.isZero() || !reservation.releasedLiters.isZero() ||
      !reservation.remainingLiters.eq(reservation.initialLiters) || !reservation.remainingLiters.gt(0)) return reject();
  // Only the currently evidenced DEMO case has a persisted provider response with
  // reference/amount/currency. Missing or commercial evidence remains assistance.
  if (payment.provider !== 'DEMO' || !order.providerId?.startsWith('demo:')) return reject();
  const [provider, capture, replay, terminal] = await Promise.all([
    tx.paymentEvent.findUnique({ where: { eventKey: 'demo-confirm:' + order.id } }),
    tx.paymentEvent.findUnique({ where: { eventKey: 'capture:' + order.id } }),
    tx.paymentEvent.findUnique({ where: { eventKey: 'captured-continuation:' + dto.operationId } }),
    tx.paymentEvent.findUnique({ where: { eventKey: 'demo-terminal:' + order.id } }),
  ]);
  let remote: { id?: string; order_number?: string; amount?: number; currency_code?: string; state?: string; paid_at?: number };
  try { remote = JSON.parse(provider?.detail || ''); } catch { return reject(); }
  if (terminal || provider?.orderId !== order.id || provider.kind !== 'DEMO_PAID' || remote.id !== order.providerId ||
      remote.order_number !== order.id || remote.amount !== order.amount.mul(100).toNumber() || remote.currency_code !== 'PEN' ||
      remote.state !== 'paid' || typeof remote.paid_at !== 'number' || !Number.isFinite(remote.paid_at) || remote.paid_at <= 0 ||
      capture?.orderId !== order.id || capture.paymentId !== payment.id || capture.kind !== 'CAPTURED') return reject();
  if (auth) {
    assertAuthorizationContext(auth, dto.operationId, dto.stationId, dto.fuelId, operation);
    if (auth.terminalOperationId !== operation.id || auth.terminalId !== operation.terminalId ||
        auth.pumpId !== operation.pumpId || auth.terminalPumpAssignmentId !== operation.terminalPumpAssignmentId ||
        auth.status !== 'RESERVED' || auth.paymentId !== payment.id || auth.requestHash.trim() !== requestHash ||
        !auth.dispensedAmount.isZero() || !auth.dispensedGallons.isZero() || auth.consumedAmount && !auth.consumedAmount.isZero() ||
        reservation.status !== 'ACTIVE' || reservation.authorizationId !== auth.id || !replay ||
        replay.orderId !== order.id || replay.paymentId !== payment.id || replay.kind !== 'CAPTURED_CONTINUED' ||
        replay.detail !== JSON.stringify({ authorizationId: auth.id })) return reject();
  } else if (reservation.status !== 'PENDING_PAYMENT' || reservation.authorizationId || replay) return reject();
  return { orderId: order.id, paymentId: payment.id };
}
