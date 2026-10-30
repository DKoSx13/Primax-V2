import { apiClient, terminalService } from './apiClient.js';
import { transactionsService } from './transactionsService.js';

/** Only a definitive provider rejection/cancellation permits a fresh operation. */
export async function releaseFailedPayment(orderId, { request = apiClient, terminal = terminalService, transactions = transactionsService } = {}) {
  const order = await request('/online-orders/' + encodeURIComponent(orderId));
  const operation = transactions.current();
  if (!operation || order.operationId !== operation.operationId) throw Error('La orden no corresponde a esta operación. Solicita asistencia.');
  if (!['FAILED', 'CANCELLED'].includes(order.status)) throw Error('El pago aún requiere confirmación. Conserva esta operación y solicita asistencia.');
  await terminal.close(operation.operationId);
  transactions.discard();
  return order;
}
