const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const stamp = value => value ? new Date(value).toLocaleString('es-PE') : '—';
let poll;
let currentRefresh;
export function stopAssistancePolling() { clearTimeout(poll); currentRefresh = null; }
export function assistanceActions(row, userId, canManage) {
  if (!canManage) return [];
  if (row.status === 'PENDIENTE') return ['ACCEPT'];
  return row.status === 'EN_ATENCION' && row.assignedStaffId === userId ? ['NOTE','RESOLVE','ESCALATE'] : [];
}
const statusLabel = (value) => ({ PENDIENTE: 'Pendiente', EN_ATENCION: 'En atención', RESUELTA: 'Resuelta', ESCALADA: 'Escalada', CANCELADA: 'Cancelada', CANCELADA_POR_CLIENTE: 'Cancelada por cliente', OPEN: 'Abierta', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelta', DISMISSED: 'Descartada' })[value] || value || '—';
const labels = { ACCEPT:'Tomar solicitud', NOTE:'Registrar observación', RESOLVE:'Resolver solicitud', ESCALATE:'Escalar solicitud' };
const reasonLabel = value => ({ AYUDA_GENERAL:'Ayuda general', ERROR_PAGO:'Error de pago', PROBLEMA_TERMINAL:'Problema de terminal', PROBLEMA_DESPACHO:'Problema de despacho', COMPROBANTE_IMPRESION:'Problema con impresión del comprobante', OTRO:'Otro' })[value] || value;
const eventLabels = {
  ASSISTANCE_CREATED:'Solicitud creada', ASSISTANCE_ACCEPT:'Solicitud aceptada',
  ASSISTANCE_NOTE:'Observación registrada', ASSISTANCE_RESOLVE:'Solicitud resuelta',
  ASSISTANCE_ESCALATE:'Solicitud escalada', ASSISTANCE_CANCELLED:'Solicitud cancelada',
  ASSISTANCE_ACCEPTED:'Solicitud aceptada', ASSISTANCE_RESOLVED:'Solicitud resuelta',
  ASSISTANCE_ESCALATED:'Solicitud escalada',
};
export const eventPresentation = action => ({ label: eventLabels[action] || 'Evento de asistencia registrado', technical: eventLabels[action] ? '' : String(action || 'Sin código') });

export async function assistancePanel({ api, stationId, userId, canManage, notificationOpen }) {
  clearTimeout(poll);
  const host = document.querySelector('#assistance-panel');
  if (!host) return;
  const refresh = async () => {
    if (!host.isConnected || document.querySelector('#assistance-dialog[open]')) return;
    try {
      const rows = await api('/control/assistance' + (stationId ? '?stationId=' + encodeURIComponent(stationId) : ''));
      if (!host.isConnected) return;
      observeAssistanceRows(rows, notificationOpen);
      host.innerHTML = `<div class="assistance-summary"><div><h2>Solicitudes e historial</h2><p role="status">${rows.filter(row => row.status === 'PENDIENTE').length} pendientes · actualización automática cada 10 segundos</p></div><button type="button" class="secondary" data-assistance-refresh>Actualizar ahora</button></div><div class="assistance-list">${rows.map(row => `<article class="assistance-card"><div class="assistance-card-head"><div><span class="field-label">Motivo</span><h3>${esc(reasonLabel(row.reason))}</h3></div><span class="badge ${row.status === 'PENDIENTE' ? 'warning' : ''}">${esc(statusLabel(row.status))}</span></div><div class="assistance-fields"><div><span class="field-label">Estación</span>${esc(row.station?.name)}</div><div><span class="field-label">Terminal y surtidor</span>${esc(row.terminal?.code)} · ${esc(row.pump?.code)}</div>${row.plate ? `<div><span class="field-label">Placa</span><span class="mono">${esc(row.plate)}</span></div>` : ''}<div><span class="field-label">Operación vinculada</span>${row.operationId ? `<span class="mono" title="Referencia técnica: ${esc(row.operationId)}">Ref. ${esc(row.operationId.slice(0,8))}</span>` : 'Sin operación vinculada'}</div><div><span class="field-label">Responsable</span>${esc(row.assignedStaff?.name)}</div><div><span class="field-label">Creada</span>${stamp(row.createdAt)}</div><div><span class="field-label">Atendida</span>${stamp(row.acceptedAt)}</div></div><div class="assistance-card-actions"><button type="button" class="secondary" data-assistance-detail="${esc(row.id)}">Contexto e historial</button>${assistanceActions(row, userId, canManage).map(action => `<button type="button" class="${action === 'ACCEPT' ? 'primary' : 'secondary'}" data-assistance-action="${action}" data-request-id="${esc(row.id)}">${labels[action]}</button>`).join('')}</div></article>`).join('') || '<p class="muted">No hay solicitudes en este alcance.</p>'}</div><dialog id="assistance-dialog"></dialog>`;
    } catch (error) { if (host.isConnected) host.textContent = 'No se pudo consultar asistencia: ' + error.message; }
  };
  currentRefresh = refresh;
  await refresh();
  const repeat = async () => { if (currentRefresh !== refresh || !host.isConnected) return; await refresh(); poll = setTimeout(repeat, 10000); };
  poll = setTimeout(repeat, 10000);
}
export function assistanceDetailMarkup(row) {
  const events = [...(row.events || [])].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  const field = (label, value) => value == null || value === '' ? '' : `<div class="assistance-info"><span class="field-label">${label}</span><strong>${esc(value)}</strong></div>`;
  const section = (title, content, empty) => `<section class="assistance-detail-block"><h3>${title}</h3>${content || `<p class="muted">${empty}</p>`}</section>`;
  const grid = content => `<div class="assistance-detail-grid">${content}</div>`;
  const operation = row.operationId ? `<div class="assistance-operation-ref"><span class="field-label">Referencia técnica de operación</span><div><strong>Ref. ${esc(String(row.operationId).slice(0,8))}</strong><button type="button" class="text-button" data-copy-assistance="${esc(row.operationId)}">Copiar UUID</button></div><details><summary>Identificador completo</summary><code>${esc(row.operationId)}</code></details></div>` : '';
  const location = field('Estación',row.station?.name)+field('Terminal',row.terminal?.code)+field('Surtidor',row.pump?.code);
  const context = field('Cliente',row.customerName)+field('Placa',row.plate);
  const attention = field('Responsable',row.assignedStaff?.name)+field('Observación',row.observation)+field('Resultado',row.result);
  const dates = field('Creada',stamp(row.createdAt))+field('Aceptada',row.acceptedAt && stamp(row.acceptedAt))+field('Resuelta',row.resolvedAt && stamp(row.resolvedAt))+field('Escalada',row.escalatedAt && stamp(row.escalatedAt))+field('Cancelada',row.cancelledAt && stamp(row.cancelledAt));
  const incidents = (row.incidents || []).map(i => `<article class="assistance-incident"><div><strong>${esc(i.code)}</strong><span class="badge">${esc(statusLabel(i.status))}</span></div><p>${esc(i.summary)}</p></article>`).join('');
  const history = events.map(e => { const presentation=eventPresentation(e.action); const details=e.details && typeof e.details==='object' ? e.details : {}; const extra=Object.entries(details).filter(([key,value])=>!['observation','result'].includes(key)&&value!=null&&value!=='').map(([key,value])=>`${key}: ${typeof value==='object'?JSON.stringify(value):value}`).join(' · '); return `<li><time>${stamp(e.createdAt)}</time><strong>${esc(presentation.label)}</strong>${e.actorKind ? `<span class="assistance-actor">${esc(e.actorKind==='USER'?'Personal autorizado':e.actorKind==='TERMINAL'?'Terminal':'Sistema')}</span>` : ''}${details.observation ? `<p>${esc(details.observation)}</p>` : ''}${details.result ? `<p>Resultado: ${esc(details.result)}</p>` : ''}${presentation.technical || extra || e.actorUserId ? `<details><summary>Datos técnicos</summary>${presentation.technical ? `<code>${esc(presentation.technical)}</code>` : ''}${e.actorUserId ? `<code>Actor: ${esc(e.actorUserId)}</code>` : ''}${extra ? `<code>${esc(extra)}</code>` : ''}</details>` : ''}</li>`; }).join('');
  return `<header class="assistance-dialog-header"><p class="eyebrow">CONTEXTO E HISTORIAL</p><div><h2 id="assistance-detail-title">${esc(reasonLabel(row.reason))}</h2><span class="badge ${row.status==='PENDIENTE'?'warning':''}">${esc(statusLabel(row.status))}</span></div><p>Creada ${stamp(row.createdAt)}</p></header><div class="assistance-detail-body">${section('Ubicación',grid(location),'Sin ubicación registrada.')}${section('Operación vinculada',`${operation}${context ? grid(context) : ''}`,'Sin operación, cliente ni placa vinculados.')}${section('Atención',grid(attention),'Aún no se registró atención.')}${section('Fechas de atención',grid(dates),'Sin fechas adicionales.')}${section('Incidencias vinculadas',incidents,'Sin incidencias vinculadas.')}${section('Historial de atención',history ? `<ol class="assistance-timeline">${history}</ol>` : '', 'Todavía no hay eventos de atención.')}</div><form method="dialog" class="assistance-dialog-actions"><button type="submit" class="secondary">Cerrar</button></form>`;
}

export function bindAssistanceActions({ api, onError }) {
  document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.copyAssistance) {
      try { await navigator.clipboard.writeText(button.dataset.copyAssistance); button.textContent = 'Copiado'; }
      catch { button.textContent = 'Selecciona el identificador para copiarlo'; }
      return;
    }
    if (button.hasAttribute('data-assistance-refresh')) { await currentRefresh?.(); return; }
    if (button.dataset.assistanceDetail) {
      try {
        const row = await api('/control/assistance/' + button.dataset.assistanceDetail);
        const dialog = document.querySelector('#assistance-dialog');
        dialog.className = 'assistance-dialog';
        dialog.setAttribute('aria-labelledby', 'assistance-detail-title');
        dialog.innerHTML = assistanceDetailMarkup(row);
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
    dialog.className = 'assistance-dialog assistance-action-dialog';
    dialog.setAttribute('aria-labelledby', 'assistance-action-title');
    dialog.innerHTML = `<div class="assistance-dialog-header"><p class="eyebrow">ATENCIÓN DE SOLICITUD</p><h2 id="assistance-action-title">${labels[action]}</h2></div><form id="assistance-action-form" aria-labelledby="assistance-action-title"><div class="assistance-field"><label for="assistance-observation">Observación${action === 'NOTE' ? ' (obligatoria)' : ' (opcional)'}</label><textarea id="assistance-observation" name="observation" maxlength="500" rows="4" ${action === 'NOTE' ? 'required' : ''}></textarea></div>${['RESOLVE','ESCALATE'].includes(action) ? '<div class="assistance-field"><label for="assistance-result">Resultado (obligatorio)</label><textarea id="assistance-result" name="result" maxlength="500" rows="4" required></textarea></div>' : ''}<p class="assistance-action-error" role="alert" aria-live="assertive"></p><div class="assistance-dialog-actions"><button class="primary" type="submit">Guardar</button><button class="secondary" type="button" data-assistance-close>Cancelar</button></div></form>`;
    dialog.querySelector('[data-assistance-close]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const submit = dialog.querySelector('[type=submit]'); if (submit.disabled) return; submit.disabled = true; submit.textContent = 'Guardando…';
      try {
        const values = Object.fromEntries(new FormData(event.target));
        await api('/control/assistance/' + button.dataset.requestId + '/actions', { method:'POST', body:JSON.stringify({ action, ...values }) });
        dialog.close(); await currentRefresh?.();
      } catch (error) { dialog.querySelector('[role=alert]').textContent = error.status === 409 ? 'La solicitud cambió de estado. Revisa el historial antes de reintentar.' : (error.message || 'No se pudo guardar la solicitud. Intenta de nuevo.'); submit.disabled = false; submit.textContent = 'Guardar'; }
    };
    dialog.showModal();
  });
}

// The first authorized response is a baseline. Only later unseen IDs are announced.
let notificationTimer;
let notificationScope = '';
export function createArrivalTracker() {
  let ready = false;
  const seen = new Set();
  return rows => {
    if (!Array.isArray(rows)) return [];
    const arrivals = ready ? rows.filter(row => row.status === 'PENDIENTE' && !seen.has(row.id)) : [];
    for (const row of rows) seen.add(row.id);
    ready = true;
    return arrivals;
  };
}
let trackArrivals = createArrivalTracker();
let notificationHost;
export function resetAssistanceNotifications() {
  clearTimeout(notificationTimer); notificationTimer = null;
  notificationScope = ''; trackArrivals = createArrivalTracker();
  notificationHost?.remove(); notificationHost = null;
}
export function observeAssistanceRows(rows, onOpen) {
  for (const row of trackArrivals(rows)) {
    if (!onOpen) continue;
    notificationHost?.remove();
    const host = document.createElement('div');
    host.className = 'assistance-toast'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
    host.innerHTML = `<strong>Nueva solicitud de asistencia</strong><p>${esc(row.station?.name)} · ${esc(row.terminal?.code)} · ${esc(reasonLabel(row.reason))}</p><div><button type="button" class="secondary" data-toast-open>Ver solicitud</button><button type="button" class="quiet" data-toast-dismiss aria-label="Descartar notificación">×</button></div>`;
    host.querySelector('[data-toast-open]').addEventListener('click', () => { host.remove(); void onOpen(row.id); });
    host.querySelector('[data-toast-dismiss]').addEventListener('click', () => host.remove());
    document.body.append(host); notificationHost = host;
  }
}
export function startAssistanceNotifications({ api, scope, stationId, onOpen }) {
  if (scope !== notificationScope) {
    resetAssistanceNotifications(); notificationScope = scope;
  }
  clearTimeout(notificationTimer);
  const refresh = async () => {
    if (notificationScope !== scope) return;
    try {
      // The visible assistance page already polls this same scoped endpoint.
      if (!document.querySelector('#assistance-panel')) {
        const rows = await api('/control/assistance' + (stationId ? '?stationId=' + encodeURIComponent(stationId) : ''));
        if (notificationScope === scope) observeAssistanceRows(rows, onOpen);
      }
    } catch { /* Keep existing notifications quiet during a temporary API failure. */ }
    if (notificationScope === scope) notificationTimer = setTimeout(refresh, 10000);
  };
  void refresh();
}
