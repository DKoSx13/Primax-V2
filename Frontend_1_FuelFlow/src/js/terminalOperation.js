import { terminalService } from './apiClient.js';
import { transactionsService } from './transactionsService.js';
import { kioskAuthEnabled, terminalRecovery } from './kioskSession.js';

export async function ensureTerminalOperation({ terminal = terminalService, transactions = transactionsService } = {}) {
  let state;
  try { state = await terminal.me(); }
  catch { throw Error('Esta terminal no está disponible. Solicita asistencia al personal de la estación.'); }
  const operationId = transactions.begin().operationId;
  try {
    const existing = await terminal.operation(operationId);
    if (existing.operationId !== operationId) throw Error('La operación requiere asistencia.');
    if (existing.closedAt || ['CLOSED','CANCELLED','FAILED','EXPIRED'].includes(existing.status)) {
      transactions.discard();
      return ensureTerminalOperation({terminal,transactions});
    }
    return existing;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (!state.canStart) {
    if (kioskAuthEnabled()) terminalRecovery();
    throw Error('Terminal temporalmente no disponible. Solicita asistencia al personal de la estación.');
  }
  let created;
  try { created = await terminal.start(operationId); }
  catch (error) {
    if (error.status === 409 && kioskAuthEnabled()) terminalRecovery();
    throw error;
  }
  if (created.operationId !== operationId || created.closedAt) throw Error('No se pudo iniciar la operación. Solicita asistencia.');
  return created;
}
