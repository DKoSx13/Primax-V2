import { Receipt } from '@prisma/client';

/** Commerce receipt contract. Issuance is enforced atomically by the database
 * trigger on Transaction INSERT; reads, retries and printing never allocate. */
export function receiptResponse(receipt?: Receipt | null) {
  return receipt ? {
    id: receipt.id, transactionId: receipt.transactionId,
    documentType: receipt.documentType, series: receipt.series,
    correlative: receipt.correlative.toString(), number: receipt.number,
    issuedAt: receipt.issuedAt.toISOString(), legacy: receipt.legacy,
    demo: true,
  } : null;
}
