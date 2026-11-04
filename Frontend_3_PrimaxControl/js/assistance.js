const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const stamp = value => value ? new Date(value).toLocaleString('es-PE') : '—';
let poll;
let currentRefresh;
export function stopAssistancePolling() { clearTimeout(poll); currentRefresh = null; }
export function assistanceActions(row, userId, supervisor) {
  if (!supervisor) return [];
  if (row.status === 'PENDIENTE') return ['ACCEPT'];
  return row.status === 'EN_ATENCION' && row.assignedSupervisorId === userId ? ['NOTE','RESOLVE','ESCALATE','CANCEL'] : [];
}
const labels = { ACCEPT:'Aceptar solicitud', NOTE:'Registrar observación', RESOLVE:'Resolver', ESCALATE:'Escalar', CANCEL:'Registrar cancelación del cliente' };

export async function assistancePanel({ api, stationId, userId, supervisor }) {
  clearTimeout(poll);
  const host = document.querySelector('#assistance-panel');
  if (!host) return;
  const refresh = async () => {
    if (!host.isConnected || document.querySelector('#assistance-dialog[open]')) return;
    try {
      const rows = await api('/control/assistance' + (stationId ? '?stationId=' + encodeURIComponent(stationId) : ''));
      if (!host.isConnected) return;
      host.innerHTML = `<h2>Solicitudes de asistencia</h2><p role="status">${rows.filter(row => row.status === 'PENDIENTE').length} pendientes · actualización automática cada 10 segundos</p><button data-assistance-refresh>Actualizar</button>${rows.map(row => `<article><h3>${esc(row.reason)} · ${esc(row.status)}</h3><p>Terminal ${esc(row.terminal?.code)} · Surtidor ${esc(row.pump?.code)} · Placa ${esc(row.plate)}</p><p>Operación ${esc(row.operationId)} · Responsable ${esc(row.assignedSupervisor?.name)}</p><p>Creada ${stamp(row.createdAt)} · Aceptada ${stamp(row.acceptedAt)}</p><button data-assistance-detail="${row.id}">Contexto e historial</button>${assistanceActions(row, userId, supervisor).map(action => `<button data-assistance-action="${action}" data-request-id="${row.id}">${labels[action]}</button>`).join('')}</article>`).join('') || '<p>No hay solicitudes en este alcance.</p>'}<dialog id="assistance-dialog"></dialog>`;
    } catch (error) { if (host.isConnected) host.textContent = 'No se pudo consultar asistencia: ' + error.message; }
  };
  currentRefresh = refresh;
  await refresh();
  const repeat = async () => { if (currentRefresh !== refresh || !host.isConnected) return; await refresh(); poll = setTimeout(repeat, 10000); };
  poll = setTimeout(repeat, 10000);
}
export function bindAssistanceActions({ api, onError }) {
  document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-assistance-refresh')) { await currentRefresh?.(); return; }
    if (button.dataset.assistanceDetail) {
      try {
        const row = await api('/control/assistance/' + button.dataset.assistanceDetail);
        const dialog = document.querySelector('#assistance-dialog');
        dialog.innerHTML = `<h2>${esc(row.reason)} · ${esc(row.status)}</h2><p>Estación ${esc(row.stationId)} · Terminal ${esc(row.terminal?.code)} · Surtidor ${esc(row.pump?.code)}</p><p>Operación ${esc(row.operationId)} · Cliente ${esc(row.customerName)} · Placa ${esc(row.plate)}</p><p>Responsable ${esc(row.assignedSupervisor?.name)}</p><p>Resultado: ${esc(row.result)} · Observación: ${esc(row.observation)}</p><p>Creación ${stamp(row.createdAt)} · Aceptación ${stamp(row.acceptedAt)} · Resolución ${stamp(row.resolvedAt)} · Escalamiento ${stamp(row.escalatedAt)} · Cancelación ${stamp(row.cancelledAt)}</p><h3>Incidencias vinculadas</h3>${row.incidents.map(i => `<p>${esc(i.code)} · ${esc(i.status)} · ${esc(i.summary)}</p>`).join('')}<h3>Historial de atención</h3>${row.events.map(e => `<p>${stamp(e.createdAt)} · ${esc(e.action)} · Actor ${esc(e.actorUserId || e.actorKind)} · ${esc(e.details?.observation)} · ${esc(e.details?.result)}</p>`).join('')}<form method="dialog"><button>Cerrar</button></form>`;
        dialog.showModal();
      } catch (error) { onError(error); }
      return;
    }
    const action = button.dataset.assistanceAction;
    if (!action) return;
    const dialog = document.querySelector('#assistance-dialog');
    if (action === 'ACCEPT') {
      button.disabled = true;
      try { await api('/control/assistance/' + button.dataset.requestId + '/actions', { method: 'POST', body: JSON.stringify({ action }) }); await currentRefresh?.(); }
      catch (error) { button.disabled = false; onError(error); }
      return;
    }
    dialog.innerHTML = `<h2>${labels[action]}</h2><form id="assistance-action-form"><label>Observación<textarea name="observation" maxlength="500" ${action === 'NOTE' ? 'required' : ''}></textarea></label>${['RESOLVE','ESCALATE'].includes(action) ? '<label>Resultado<textarea name="result" maxlength="500" required></textarea></label>' : ''}<p role="alert"></p><button type="submit">Guardar</button><button type="button" data-assistance-close>Cerrar</button></form>`;
    dialog.querySelector('[data-assistance-close]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const submit = dialog.querySelector('[type=submit]'); submit.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(event.target));
        await api('/control/assistance/' + button.dataset.requestId + '/actions', { method:'POST', body:JSON.stringify({ action, ...values }) });
        dialog.close(); await currentRefresh?.();
      } catch (error) { dialog.querySelector('[role=alert]').textContent = error.message; submit.disabled = false; }
    };
    dialog.showModal();
  });
}
