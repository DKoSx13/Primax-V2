import { apiClient, terminalService } from './apiClient.js';
import { recoveredOperationId, finishRecoveredSession } from './kioskSession.js';
import { recoveryStatusLabel } from './recoveryLabels.js';
import { releaseRecoveredTab } from './terminalTab.js';
import { terminalIdentityText } from './terminalIdentity.js';

export function recoveryActions(state) {
  const pending = state?.status === 'ACTIVE' && state.order?.status === 'PENDING' &&
    state.payment?.status === 'PENDING' && state.reservation?.status === 'PENDING_PAYMENT' &&
    !state.authorization && !state.sale;
  const cancelled = state?.status === 'ACTIVE' && state.order?.status === 'CANCELLED' &&
    state.payment?.status === 'CANCELLED' && state.reservation?.status === 'CANCELLED' &&
    !state.authorization && !state.sale;
  const settled = state?.status === 'ACTIVE' && state.order?.status === 'CAPTURED' &&
    state.payment?.status === 'CAPTURED' && state.authorization?.status === 'SETTLED' &&
    state.reservation?.status === 'CLOSED' && state.sale?.status === 'PAID' && Boolean(state.receipt?.number);
  return { cancel: Boolean(pending), close: Boolean(cancelled || settled) };
}

/** Recovery uses only the operation ID in the authenticated backend session. */
export async function showRecoveryDesk({ terminal = terminalService, request = apiClient } = {}) {
  const operationId = recoveredOperationId();
  if (!operationId) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'terminal-access recovery-desk';
  dialog.setAttribute('aria-label', 'Operación recuperada');
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.innerHTML = '<div class="terminal-access-card"><div class="terminal-access-brand">PRIMAX <span>FuelFlow</span></div><h1>Operación recuperada</h1><p data-identity></p><dl><dt>Orden</dt><dd data-order></dd><dt>Pago</dt><dd data-payment></dd><dt>Autorización</dt><dd data-authorization></dd><dt>Reserva</dt><dd data-reservation></dd><dt>Venta</dt><dd data-sale></dd><dt>Comprobante</dt><dd data-receipt></dd></dl><p data-note>El estado procede de Backend. Esta sesión solo permite resolver la operación indicada.</p><button type="button" data-refresh>Actualizar estado</button><button type="button" data-cancel hidden>Cancelar orden pendiente</button><button type="button" data-close hidden>Cerrar atención</button><p class="terminal-access-error" role="alert" data-error></p></div>';
  document.body.append(dialog);
  dialog.showModal();
  const find = key => dialog.querySelector(`[data-${key}]`);
  let state = null;
  let busy = false;
  const refresh = async () => {
    if (busy) return;
    busy = true;
    find('error').textContent = '';
    try {
      state = await terminal.recoveryState(operationId);
      if (state.operationId !== operationId) throw Error('La operación no coincide con la sesión recuperada.');
      find('identity').textContent = `${state.number || operationId} · ${terminalIdentityText(state) || 'Terminal sin asignación confirmada'} · ${recoveryStatusLabel('operation', state.status)}`;
      find('order').textContent = `${state.order?.method || '—'} · ${recoveryStatusLabel('order', state.order?.status)} · S/ ${state.order?.amount ?? '—'}`;
      find('payment').textContent = recoveryStatusLabel('payment', state.payment?.status);
      find('authorization').textContent = state.authorization ? recoveryStatusLabel('authorization', state.authorization.status) : 'Sin autorización';
      find('reservation').textContent = recoveryStatusLabel('reservation', state.reservation?.status);
      find('sale').textContent = state.sale ? recoveryStatusLabel('sale', state.sale.status) : 'Sin venta';
      find('receipt').textContent = state.receipt?.number || 'Sin comprobante';
      const actions = recoveryActions(state);
      find('cancel').hidden = !actions.cancel;
      find('close').hidden = !actions.close;
      find('note').textContent = actions.cancel ? 'La orden sigue pendiente. Cancelarla requiere tu confirmación.' :
        actions.close ? 'Backend permite intentar el cierre de esta atención. Confirma los estados antes de continuar.' :
        'No hay una acción habilitada para este estado. Solicita revisión administrativa.';
    } catch (error) {
      state = null;
      find('cancel').hidden = true;
      find('close').hidden = true;
      find('error').textContent = error.message || 'No se pudo consultar Backend.';
    } finally { busy = false; }
  };
  find('refresh').addEventListener('click', () => { void refresh(); });
  find('cancel').addEventListener('click', async () => {
    if (busy || !recoveryActions(state).cancel || !state.order?.id) return;
    if (!window.confirm(`¿Cancelar únicamente la orden ${state.order.method} pendiente de ${state.number}? No se confirmará ningún pago.`)) return;
    busy = true;
    find('cancel').disabled = true;
    find('error').textContent = '';
    try { await request(`/online-orders/${encodeURIComponent(state.order.id)}/cancel`, { method: 'POST', body: {} }); }
    catch (error) { find('error').textContent = error.message || 'La cancelación no fue confirmada. Consulta el estado antes de reintentar.'; }
    finally { busy = false; find('cancel').disabled = false; await refresh(); }
  });
  find('close').addEventListener('click', async () => {
    if (busy || !recoveryActions(state).close) return;
    if (!window.confirm(`¿Cerrar únicamente la atención ${state.number}? Backend volverá a verificar pagos e inventario.`)) return;
    busy = true;
    find('close').disabled = true;
    find('error').textContent = '';
    try {
      const result = await terminal.close(operationId);
      if (result.status !== 'CLOSED' || !result.closedAt) throw Error('Backend no confirmó el cierre.');
      find('cancel').hidden = true;
      find('close').hidden = true;
      find('refresh').hidden = true;
      find('note').textContent = `${state.number} cerrada por Backend. El pago, la venta y el comprobante no se alteraron desde esta pantalla.`;
      finishRecoveredSession();
      releaseRecoveredTab();
    } catch (error) { find('error').textContent = error.message || 'No se confirmó el cierre. Conserva esta sesión.'; find('close').disabled = false; }
    finally { busy = false; }
  });
  await refresh();
  await new Promise(() => {}); // Never enter the ordinary sale flow with a recovery credential.
}
