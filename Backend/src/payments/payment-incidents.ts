import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/** Stable per-operation incident; every further observation is append-only audit. */
export async function recordPaymentIssue(
  tx: Prisma.TransactionClient,
  operationId: string,
  summary: string,
  actorUserId?: string,
) {
  const operation = await tx.terminalOperation.findUnique({
    where: { operationId },
  });
  const transaction = operation
    ? null
    : await tx.transaction.findUnique({ where: { operationId } });
  const context = operation ?? transaction;
  if (!context) return null;
  const payment = await tx.payment.findUnique({ where: { operationId } });
  const incident = await tx.operationalIncident.upsert({
    where: { code_operationId: { code: 'PAYMENT_AMBIGUOUS', operationId } },
    create: {
      eventKey: `payment-review:${operationId}`,
      code: 'PAYMENT_AMBIGUOUS',
      stationId: context.stationId,
      terminalId: context.terminalId,
      pumpId: context.pumpId,
      operationId,
      terminalOperationId: operation?.id,
      transactionId: transaction?.id,
      paymentId: payment?.id,
      summary: summary.slice(0, 300),
      context: {
        method: payment?.method ?? null,
        paymentStatus: payment?.status ?? null,
        supervisorUserId: actorUserId ?? null,
      },
    },
    update: {},
  });
  await tx.operationalAuditEvent.create({
    data: {
      eventKey: `payment-review:${operationId}:${randomUUID()}`,
      actorKind: actorUserId ? 'USER' : 'SYSTEM',
      actorUserId,
      stationId: context.stationId,
      terminalId: context.terminalId,
      action: 'PAYMENT_REVIEW_RECORDED',
      targetId: incident.id,
      outcome: 'SUCCESS',
      details: {
        operationId,
        summary,
        paymentId: payment?.id ?? null,
        method: payment?.method ?? null,
        paymentStatus: payment?.status ?? null,
      },
    },
  });
  return incident;
}
