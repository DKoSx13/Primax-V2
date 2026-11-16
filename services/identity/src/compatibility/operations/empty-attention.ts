import { Prisma, TerminalOperation } from '@prisma/client';

// Existing credential activity acts as a renewable lease; never a financial timeout.
export const EMPTY_ATTENTION_IDLE_MS = 2 * 60 * 1000;

export async function isEmptyAttention(tx: Prisma.TransactionClient, operation: TerminalOperation) {
  if (operation.status !== 'ACTIVE') return false;
  const linked = { OR: [{ operationId: operation.operationId }, { terminalOperationId: operation.id }] };
  const evidence = await Promise.all([
    tx.fuelAuthorization.findFirst({ where: linked, select: { id: true } }),
    tx.transaction.findFirst({ where: linked, select: { id: true } }),
    tx.payment.findFirst({ where: { operationId: operation.operationId }, select: { id: true } }),
    // Even a pending/failed provider request requires explicit reconciliation.
    tx.onlineOrder.findFirst({ where: { operationId: operation.operationId }, select: { id: true } }),
    tx.inventoryReservation.findFirst({ where: linked, select: { id: true } }),
    tx.operationalIncident.findFirst({ where: {
      status: { in: ['OPEN', 'IN_REVIEW'] },
      OR: [{ operationId: operation.operationId }, { terminalOperationId: operation.id }, { terminalId: operation.terminalId }],
    }, select: { id: true } }),
  ]);
  return evidence.every(value => !value);
}
