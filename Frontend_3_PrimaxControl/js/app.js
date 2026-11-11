import { bindPaymentRecovery, paymentRecoveryButton } from './payment-recovery.js';
import { API_BASE_URL, FUELFLOW_PUBLIC_ORIGIN, FUELFLOW_T02_PUBLIC_ORIGIN } from './config.js';
import { recoveryTerminalOrigin as configuredRecoveryOrigin } from './recovery-origin.js';
import { canViewStation, initialView, incidentMessage, controlModules, visibleModules, defaultView } from './control-state.js';
import { createControlApi } from './control-api.js';
import { assistancePanel, bindAssistanceActions, stopAssistancePolling, startAssistanceNotifications, resetAssistanceNotifications } from './assistance.js';
import { createPrintAgent } from './print-agent.js';
import { administrativeAccountForm, ecoDigitalMetricMarkup, fuelSummaryMarkup, permissionGroups, permissionLabel } from './control-presentation.js';
import { movementKindLabel, formatLiters } from './movement-presentation.js';
import { operationStatusLabel, operationFinancialLabel, operationDetailStatusLabel } from './operation-labels.js';
import { parseDisplayDate, renderDateInputs } from './date-input.js';

const app = document.querySelector('#app');
const apiClient = createControlApi(window.fetch.bind(window), API_BASE_URL);
const api = apiClient.request;
const sendToPrintAgent = createPrintAgent();
let session = null;
bindPaymentRecovery({ api, onError: showError });
bindAssistanceActions({ api, getUserId: () => session?.user?.id, onError: showError });
let selectedStation = '';
let busy = false;
let accountRows = [];
let inventoryRows = [];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value, digits = 2) => value == null ? '—' : Number(value).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const stamp = (value) => value ? new Date(value).toLocaleString('es-PE') : '—';
const has = (permission) => Boolean(session?.permissions?.includes(permission));
const actor = () => session?.user?.name || '—';
function recoveryTerminalOrigin(code) {
  return configuredRecoveryOrigin(code, FUELFLOW_PUBLIC_ORIGIN, FUELFLOW_T02_PUBLIC_ORIGIN);
}
const queryString = (values) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== '' && value != null) query.set(key, value);
  return query.toString();
};
const dateInputs = (filters = {}) => renderDateInputs(filters, esc);

function login(message = '') {
  app.innerHTML = `<main class="login-wrap"><section class="login-card"><div class="brand"><img class="brand-logo" src="assets/Logotipo%20Primax%20Control%20en%20azul%20y%20naranja.png" alt="Primax Control" decoding="async"></div><p class="eyebrow">OPERACIÓN Y ADMINISTRACIÓN</p><h1>Inicia sesión</h1><p class="muted">Acceso para personal autorizado de estación.</p><form id="login-form"><label>Correo<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label><p class="error" role="alert">${esc(message)}</p><button class="primary" type="submit">Entrar a Control</button></form><div class="public-links"><a href="#request-access">Solicitar acceso administrativo</a><button class="text-button" type="button" id="resend-link">Reenviar verificación</button></div></section></main>`;
}

function requestAccess(message = '') {
  app.innerHTML = `<main class="login-wrap"><section class="login-card"><div class="brand"><img class="brand-logo" src="assets/Logotipo%20Primax%20Control%20en%20azul%20y%20naranja.png" alt="Primax Control" decoding="async"></div><p class="eyebrow">SOLICITUD DE ACCESO</p><h1>Crear solicitud</h1><p class="muted">El acceso requiere verificar el correo y aprobación del Administrador del sistema.</p><form id="request-form"><label>Nombre<input name="name" autocomplete="name" required maxlength="80"></label><label>Correo<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Contraseña<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="72"></label><label>Acceso solicitado<select name="role"><option value="ENCARGADO">Encargado</option><option value="ADMIN">Administrador</option></select></label><p class="error" role="alert">${esc(message)}</p><button class="primary" type="submit">Enviar solicitud</button></form><div class="public-links"><a href="#login">Volver al acceso</a></div></section></main>`;
}

const nav = controlModules;

function shell(view) {
  const visible = visibleModules(session);
  const stationList = session.stations;
  if (!session.global && !stationList.some((station) => station.id === selectedStation)) selectedStation = '';
  const icons = { dashboard:'▦', operations:'↗', transactions:'S/', customers:'♙', memberships:'★', vehicles:'⌑', terminals:'▣', inventory:'◫', movements:'⇅', supply:'＋', incidents:'◉', assistance:'◉', accounts:'♙', audit:'☷' };
  const displayedRole = roleLabel(session.role === 'SYSTEM_ADMIN' || session.roles?.includes('SYSTEM_ADMIN') ? 'SUPER_ADMIN' : session.role);
  app.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="#${defaultView(session)}"><img class="brand-logo" src="assets/Logotivo%20V2.png" alt="Primax Control" decoding="async"></a><div class="nav-label">ADMINISTRACIÓN</div><nav>${visible.map(([id, title]) => `<a href="#${id}" ${view === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icons[id] || '•'}</span><span>${title}</span></a>`).join('')}</nav><div class="sidebar-foot"><span class="status-dot"></span> Servicio conectado</div></aside><section class="workspace"><header class="topbar"><div class="station-picker"><label for="station">Estación</label><select id="station"><option value="">${session.global ? 'Todas las estaciones' : 'Todas las asignadas'}</option>${stationList.map((station) => `<option value="${esc(station.id)}" ${station.id === selectedStation ? 'selected' : ''}>${esc(station.name)} · ${esc(station.code)}</option>`).join('')}</select></div><div class="user-menu"><span class="avatar">${esc(session.user.name.slice(0, 1).toUpperCase())}</span><span><strong>${esc(session.user.name)}</strong><small>${esc(displayedRole)}</small></span><button id="logout" class="quiet">Cerrar sesión</button></div></header><main id="content" tabindex="-1"></main></section></div>`;
  document.querySelector('#station').addEventListener('change', (event) => { selectedStation = event.target.value; void route(); });
  if (has('ADMIN_INCIDENT_VIEW')) startAssistanceNotifications({ api, scope: session.user.id + ':' + selectedStation, stationId: selectedStation, onOpen: openAssistanceRequest });
  else resetAssistanceNotifications();
  document.querySelector('#logout').addEventListener('click', async () => { try { await apiClient.logout(); } finally { session = null; selectedStation = ''; resetAssistanceNotifications(); login(); } });
}

async function openAssistanceRequest(id) {
  if (!has('ADMIN_INCIDENT_VIEW')) return;
  history.replaceState(null, '', `${location.pathname}${location.search}#assistance`);
  await route();
  document.querySelector(`[data-assistance-detail="${CSS.escape(id)}"]`)?.click();
}

function heading(section, title, description = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${esc(section)}</p><h1>${esc(title)}</h1>${description ? `<p class="muted">${esc(description)}</p>` : ''}</div></div>`;
}
function panel(message, kind = 'empty') { return `<section class="panel ${kind}"><p>${esc(message)}</p></section>`; }
function loading(message = 'Cargando datos reales…') { document.querySelector('#content').innerHTML = `<div class="loading" role="status">${esc(message)}</div>`; }
function showError(error, title = 'No se pudo completar la solicitud') {
  const target = document.querySelector('#content');
  if (target) target.insertAdjacentHTML('afterbegin', `<p class="error-banner" role="alert"><strong>${esc(title)}.</strong> ${esc(incidentMessage(error))}</p>`);
}
function stationsOptions(selected = selectedStation) {
  return session.stations.map((station) => `<option value="${esc(station.id)}" ${station.id === selected ? 'selected' : ''}>${esc(station.name)} · ${esc(station.code)}</option>`).join('');
}

const dateLabel = (value) => value ? new Date(value).toLocaleDateString('es-PE') : '—';
const paymentLabel = (value) => ({ CAPTURED: 'Pago confirmado', PAID: 'Pagado', PENDING: 'Pendiente', PAYMENT_PENDING: 'Pago pendiente', PARTIAL: 'Parcial', REJECTED: 'Rechazado', REFUNDED: 'Reembolsado', CANCELLED: 'Cancelado', ERROR: 'Error', REVIEW: 'En revisión', INTERVENTION_REQUIRED: 'Intervención requerida', SETTLED: 'Liquidado', CLOSED: 'Cerrado', ACTIVE: 'Activo' })[value] || value || '—';
const statusLabel = (value) => ({ OPEN: 'Abierta', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelta', DISMISSED: 'Descartada', ACTIVE: 'Activa', INACTIVE: 'Inactiva', PENDING: 'Pendiente', PENDING_APPROVAL: 'Pendiente de aprobación', APPROVED: 'Aprobada', DISABLED: 'Deshabilitada', ABIERTO: 'Abierto', CERRADO: 'Cerrado', READY: 'Lista', EN_ATENCION: 'En atención', FUERA_DE_SERVICIO: 'Fuera de servicio', ASISTENCIA: 'Requiere asistencia', INTERVENTION_REQUIRED: 'Requiere intervención' })[value] || paymentLabel(value);
const roleLabel = (value) => ({ SYSTEM_ADMIN: 'Administrador del sistema', SUPER_ADMIN: 'Administrador del sistema', ADMIN: 'Administrador', ENCARGADO: 'Encargado' })[value] || value || '—';
const permissionMask = (value) => value == null ? '—' : esc(value);

async function renderCustomers(filters = {}) {
  loading('Consultando clientes vinculados a Primax Prime…');
  try {
    const query = queryString({ stationId: filters.stationId ?? selectedStation, q: filters.q });
    const rows = await api(`/control/customers${query ? `?${query}` : ''}`);
    document.querySelector('#content').innerHTML = `${heading('CLIENTES', 'Clientes', 'Se muestran los clientes Prime y, para cuentas con acceso limitado a estaciones, únicamente si registran actividad allí.')}<form id="customer-filters" class="filter-bar"><label>Nombre, correo, membresía o placa<input name="q" value="${esc(filters.q || '')}" maxlength="80"></label><button class="secondary">Buscar</button></form><section class="panel table-wrap"><table><thead><tr><th>Cliente</th><th>Estado</th><th>Membresía Prime</th><th>Estado Prime</th><th>Vehículos visibles</th><th>Última actividad</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.name)}<small class="subcell">${esc(row.email)}</small></td><td>${row.active ? 'Activo' : 'Inactivo'}</td><td>${esc(row.membership?.number || '—')}</td><td>${esc(statusLabel(row.membership?.status || 'Sin permiso'))}</td><td>${row.vehicles.length}</td><td>${stamp(row.lastActivityAt)}</td><td><button class="text-button" data-customer="${row.id}">Detalle</button></td></tr>`).join('') || '<tr><td colspan="7">No hay clientes vinculados a este alcance.</td></tr>'}</tbody></table></section><dialog id="customer-dialog" class="customer-dialog" aria-label="Detalle del cliente"></dialog><dialog id="receipt-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderMemberships(filters = {}) {
  loading('Consultando membresías Prime…');
  try {
    const query = queryString({ stationId: filters.stationId ?? selectedStation, q: filters.q, status: filters.status });
    const rows = await api(`/control/memberships${query ? `?${query}` : ''}`);
    document.querySelector('#content').innerHTML = `${heading('PRIMAX PRIME', 'Membresías Prime', 'Saldo consultado en el sistema. Control no permite recargas ni modificaciones financieras.')}<form id="membership-filters" class="filter-bar"><label>Buscar cliente o número<input name="q" value="${esc(filters.q || '')}" maxlength="80"></label><label>Estado<select name="status"><option value="">Todos</option><option value="ACTIVE" ${filters.status === 'ACTIVE' ? 'selected' : ''}>Activa</option><option value="SUSPENDED" ${filters.status === 'SUSPENDED' ? 'selected' : ''}>Suspendida</option></select></label><button class="secondary">Filtrar</button></form><section class="panel table-wrap"><table><thead><tr><th>Número</th><th>Cliente</th><th>Estado</th><th>Saldo Prime</th><th>Creada</th><th>Última actividad</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td class="mono">${esc(row.number)}</td><td>${esc(row.customer.name)}<small class="subcell">${esc(row.customer.email)}</small></td><td><span class="badge">${esc(statusLabel(row.status))}</span></td><td>${row.balance == null ? 'Restringido por alcance' : `S/ ${fmt(row.balance)}`}</td><td>${dateLabel(row.createdAt)}</td><td>${stamp(row.lastActivityAt)}</td><td><button class="text-button" data-customer="${row.customer.id}">Cliente</button></td></tr>`).join('') || '<tr><td colspan="7">No hay membresías en este alcance.</td></tr>'}</tbody></table></section><dialog id="customer-dialog" class="customer-dialog" aria-label="Detalle del cliente"></dialog><dialog id="receipt-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderVehicles(filters = {}) {
  loading('Consultando vehículos y placas registradas…');
  try {
    const query = queryString({ stationId: filters.stationId ?? selectedStation, q: filters.q });
    const rows = await api(`/control/vehicles${query ? `?${query}` : ''}`);
    document.querySelector('#content').innerHTML = `${heading('VEHÍCULOS Y PLACAS', 'Vehículos', 'La placa es un dato registrado o capturado en operaciones; OCR no es autenticación ni autorización financiera.')}<form id="vehicle-filters" class="filter-bar"><label>Placa, modelo o cliente<input name="q" value="${esc(filters.q || '')}" maxlength="80"></label><button class="secondary">Buscar</button></form><section class="panel table-wrap"><table><thead><tr><th>Placa</th><th>Vehículo</th><th>Propietario</th><th>Membresía</th><th>Estado de placa</th><th>Última actividad</th></tr></thead><tbody>${rows.map((row) => `<tr><td class="mono">${esc(row.plate)}</td><td>${esc(row.label)}</td><td>${esc(row.customer?.name || 'Sin propietario Prime asociado')}</td><td>${esc(row.membership?.number || '—')}</td><td><span class="badge">${esc(row.plateEvidence.replaceAll('_', ' '))}</span></td><td>${stamp(row.lastActivityAt)}</td></tr>`).join('') || '<tr><td colspan="6">No hay placas registradas dentro de este alcance.</td></tr>'}</tbody></table></section>`;
  } catch (error) { showError(error); }
}

async function renderTransactions(filters = {}) {
  loading('Consultando pagos y transacciones…');
  try {
    const query = queryString({ stationId: filters.stationId ?? selectedStation, q: filters.q, status: filters.status, method: filters.method, mode: filters.mode, from: filters.from, to: filters.to });
    const rows = await api(`/control/transactions${query ? `?${query}` : ''}`);
    document.querySelector('#content').innerHTML = `${heading('PAGOS', 'Transacciones', `${rows.length} transacciones y autorizaciones de pago visibles.`)}<form id="transaction-filters" class="filter-bar"><label>Operación o placa<input name="q" value="${esc(filters.q || '')}" maxlength="80"></label><label>Estado financiero<select name="status"><option value="">Todos</option>${['CAPTURED','PAID','PENDING','PAYMENT_PENDING','PARTIAL','REJECTED','REFUNDED','CANCELLED','ERROR','REVIEW'].map((status) => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${paymentLabel(status)}</option>`).join('')}</select></label><label>Método<select name="method"><option value="">Todos</option>${['YAPE','PLIN','TARJETA','EFECTIVO','SALDO_PRIME'].map((method) => `<option ${filters.method === method ? 'selected' : ''}>${method}</option>`).join('')}</select></label><label>Modalidad<select name="mode"><option value="">Todas</option><option value="PREPAGO" ${filters.mode === 'PREPAGO' ? 'selected' : ''}>Prepago</option><option value="POSTPAGO" ${filters.mode === 'POSTPAGO' ? 'selected' : ''}>Postpago</option></select></label>${dateInputs(filters)}<button class="secondary">Filtrar</button></form><section class="panel table-wrap"><table><thead><tr><th>Fecha</th><th>Operación</th><th>Estación</th><th>Cliente / placa</th><th>Combustible</th><th>Modalidad</th><th>Pago</th><th>Estado físico</th><th>Comprobante</th><th>Importe</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td>${stamp(row.occurredAt)}</td><td class="mono" title="Referencia técnica: ${esc(row.operationId)}">${esc(row.number || "Sin correlativo")}</td><td>${esc(row.station.name)}</td><td>${esc(row.customer?.name || '—')}<small class="subcell">${esc(row.plate)}</small></td><td>${esc(row.fuel.name)}</td><td>${esc(row.mode)}</td><td><span class="badge ${row.financialStatus === 'CAPTURED' || row.financialStatus === 'PAID' ? '' : 'warning'}">${esc(paymentLabel(row.financialStatus))}${row.method ? ` · ${esc(row.method)}` : ''}</span></td><td>${esc(paymentLabel(row.reviewStatus || row.physicalStatus))}</td><td>${esc(row.receipt?.documentType || '?')}<small class="subcell mono">${esc(row.receipt?.number || 'Sin comprobante')}</small></td><td>S/ ${fmt(row.amount)}</td><td>${row.transactionId ? `<button class="text-button" data-transaction="${row.transactionId}">Detalle</button>` : 'Autorización'}</td></tr>`).join('') || '<tr><td colspan="11">No hay transacciones para esos filtros.</td></tr>'}</tbody></table></section><dialog id="transaction-dialog"></dialog><dialog id="receipt-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

function receiptMarkup(receipt) {
  return `<div class="receipt-paper"><p class="eyebrow">COMPROBANTE ACADÉMICO · NO TRIBUTARIO</p><h2>PRIMAX · DEMO</h2><p>${esc(receipt.station)} · Surtidor ${esc(receipt.pump || '—')}</p><hr><p>Operación: <span class="mono">${esc(receipt.transactionId || receipt.id)}</span></p><h3>${esc(receipt.documentType)} - N.º ${esc(receipt.number || 'Sin numeración histórica')}</h3><p>Fecha: ${stamp(receipt.issuedAt)}</p><p>Placa: ${esc(receipt.plate)}</p><p>Combustible: ${esc(receipt.fuel)}</p><p>Cantidad: ${fmt(receipt.gallons, 3)} gal</p><p>Precio unitario: S/ ${fmt(receipt.unitPrice)}</p><p>Modalidad / pago: ${esc(receipt.mode)} · ${esc(receipt.paymentMethod)}</p><p>Estado: <strong>${esc(receipt.state)}</strong></p><hr><p class="receipt-total">TOTAL S/ ${fmt(receipt.total)}</p>${receipt.dni ? `<p>DNI: ${esc(receipt.dni)}</p>` : ''}${receipt.ruc ? `<p>RUC: ${esc(receipt.ruc)} · ${esc(receipt.businessName)}</p>` : ''}</div>`;
}

async function showReceipt(transactionId) {
  try {
    const receipt = await api(`/control/receipts/${encodeURIComponent(transactionId)}`);
    const dialog = document.querySelector('#receipt-dialog');
    dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form>${receiptMarkup(receipt)}<p class="muted">La copia refleja el estado guardado de la transacción. No tiene validez tributaria oficial.</p><p class="error" role="alert"></p><div class="actions"><button type="button" class="primary" data-print-agent="${receipt.id}" ${receipt.pump !== '03' ? 'disabled title="PrintAgent requiere el surtidor 03 en esta instalación"' : ''}>${receipt.pump === '03' ? 'Solicitar a PrintAgent local' : 'PrintAgent no disponible para este surtidor'}</button></div>`;
    dialog.showModal();
    dialog.querySelector('[data-print-agent]').addEventListener('click', async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { await sendToPrintAgent(receipt); dialog.querySelector('.error').textContent = 'PrintAgent aceptó el trabajo; la salida física no está confirmada.'; }
      catch (error) { dialog.querySelector('.error').textContent = incidentMessage(error); }
      finally { button.disabled = false; }
    });

  } catch (error) { window.alert(incidentMessage(error)); }
}

async function renderDashboard() {
  loading();
  try {
    const suffix = selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : '';
    const data = await api(`/control/dashboard${suffix}`);
    const unavailable = data.terminals.filter((entry) => ['ASISTENCIA', 'FUERA_DE_SERVICIO'].includes(entry.status)).reduce((sum, entry) => sum + entry.count, 0);
    document.querySelector('#content').innerHTML = `${heading('RESUMEN OPERATIVO', 'Panel de control', 'Indicadores consultados en tiempo real desde Primax V2.')}<section class="metrics"><article class="metric"><span>Operaciones hoy</span><strong>${data.operationsToday}</strong><small>Transacciones registradas</small></article><article class="metric"><span>Operaciones activas</span><strong>${data.activeOperations}</strong><small>Despachos en curso</small></article><article class="metric"><span>Ingresos confirmados hoy</span><strong>S/ ${fmt(data.capturedRevenueToday)}</strong><small>Pagos confirmados</small></article><article class="metric"><span>Clientes activos</span><strong>${data.activeCustomers ?? '—'}</strong><small>Usuarios activos con actividad en alcance</small></article><article class="metric"><span>Membresías activas</span><strong>${data.activeMemberships ?? '—'}</strong><small>Membresías en estado activo</small></article><article class="metric"><span>Incidencias abiertas</span><strong>${data.openIncidents}</strong><small>Abiertas o en revisión</small></article><article class="metric"><span>Terminales en atención</span><strong>${unavailable}</strong><small>Asistencia o fuera de servicio</small></article></section><div class="grid dashboard-grid"><section class="panel"><div class="panel-head"><h2>Combustible disponible</h2><span>${data.reviewPairs} pares en revisión</span></div>${fuelSummaryMarkup(data, { esc, fmt, statusLabel })}</section><section class="panel"><div class="panel-head"><h2>Estado de terminales</h2><span>${data.stations.length} estaciones visibles</span></div><div class="terminal-stats">${data.terminals.map((item) => `<div><span class="status-dot ${['ASISTENCIA','FUERA_DE_SERVICIO'].includes(item.status) ? 'red' : ''}"></span>${esc(statusLabel(item.status))}<strong>${item.count}</strong></div>`).join('') || '<p class="muted">Sin terminales registradas.</p>'}</div></section></div>`;
    document.querySelector('#content .metrics').insertAdjacentHTML('beforeend', ecoDigitalMetricMarkup(data.receiptsAvailableToday));
  } catch (error) { document.querySelector('#content').innerHTML = `${heading('RESUMEN OPERATIVO', 'Panel de control')}${panel(incidentMessage(error), 'denied')}`; }
}

async function renderOperations(filters = {}) {
  loading('Consultando operaciones…');
  try {
    const stationId = filters.stationId ?? selectedStation;
    const query = queryString({ stationId, terminalId: filters.terminalId, pumpId: filters.pumpId, status: filters.status, mode: filters.mode, from: filters.from, to: filters.to });
    const rows = await api(`/control/operations${query ? `?${query}` : ''}`);
    const equipmentRows = filters.terminalId || filters.pumpId
      ? await api(`/control/operations${stationId ? `?stationId=${encodeURIComponent(stationId)}` : ''}`)
      : rows;
    const terminals = [...new Map(equipmentRows.filter((row) => row.terminal).map((row) => [row.terminal.id, row.terminal])).values()];
    const pumps = [...new Map(equipmentRows.filter((row) => row.pump).map((row) => [row.pump.id, row.pump])).values()];
    const equipmentFilters = `<label>Terminal<select name="terminalId"><option value="">Todas</option>${terminals.map((terminal) => `<option value="${esc(terminal.id)}" ${filters.terminalId === terminal.id ? 'selected' : ''}>${esc(terminal.code)}</option>`).join('')}</select></label><label>Surtidor<select name="pumpId"><option value="">Todos</option>${pumps.map((pump) => `<option value="${esc(pump.id)}" ${filters.pumpId === pump.id ? 'selected' : ''}>${esc(pump.code)}</option>`).join('')}</select></label>`;
    document.querySelector('#content').innerHTML = `${heading('ACTIVIDAD', 'Operaciones', `${rows.length} operaciones en el resultado.`)}<form id="operation-filters" class="filter-bar"><label>Estado<select name="status"><option value="">Todos</option>${['ACTIVE','INTERVENTION_REQUIRED','CLOSED','RESERVED','DISPENSING','SETTLED','RELEASED','PAID','REFUNDED','PAYMENT_PENDING'].map((status) => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${operationStatusLabel(status)}</option>`).join('')}</select></label><label>Modalidad<select name="mode"><option value="">Todas</option><option value="PREPAGO" ${filters.mode === 'PREPAGO' ? 'selected' : ''}>Prepago</option><option value="POSTPAGO" ${filters.mode === 'POSTPAGO' ? 'selected' : ''}>Postpago</option></select></label>${equipmentFilters}${dateInputs(filters)}<button class="secondary">Filtrar</button></form><section class="operation-list" aria-label="Operaciones visibles">${rows.map((row) => `<article class="operation-card"><div class="operation-card-head"><div><span class="field-label">Operación</span><strong class="mono" title="UUID: ${esc(row.operationId)}">${esc(row.number || "Sin correlativo")}</strong></div><span class="badge" title="Estado: ${esc(row.status)}">${esc(operationStatusLabel(row.status))}</span><div class="operation-card-date"><span class="field-label">Fecha y hora</span><strong>${stamp(row.occurredAt)}</strong></div></div><div class="operation-card-grid"><div><span class="field-label">Estación</span>${esc(row.station?.name || '—')}</div><div><span class="field-label">Terminal / surtidor</span>${esc(row.terminal?.code || '—')} / ${esc(row.pump?.code || '—')}</div>${row.plate ? `<div><span class="field-label">Placa</span><span class="mono">${esc(row.plate)}</span></div>` : ''}<div><span class="field-label">Combustible</span>${esc(row.fuel?.name || '—')}</div><div><span class="field-label">Modalidad</span>${esc(row.mode === 'PREPAGO' ? 'Prepago' : row.mode === 'POSTPAGO' ? 'Postpago' : row.mode || '—')}</div>${row.financialStatus ? `<div><span class="field-label">Estado financiero</span><span class="badge">${esc(operationFinancialLabel(row.financialStatus))}</span></div>` : ''}${row.receipt?.number ? `<div><span class="field-label">Comprobante</span><span class="mono">${esc(row.receipt.number)}</span></div>` : ''}${row.amount == null ? '' : `<div><span class="field-label">Importe</span>S/ ${fmt(row.amount)}</div>`}${row.dispensedGallons == null ? '' : `<div><span class="field-label">Despacho</span>${fmt(row.dispensedGallons,3)} gal</div>`}</div><div class="operation-card-actions"><button type="button" class="secondary" data-operation="${esc(row.operationId)}">Consultar detalle</button></div></article>`).join('') || '<section class="panel"><p class="muted">No hay operaciones para esos filtros.</p></section>'}</section><dialog id="operation-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderTerminals() {
  loading('Consultando terminales y surtidores…');
  try {
    const suffix = selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : '';
    const { terminals, pumps } = await api(`/control/terminals${suffix}`);
    const status = { DISPONIBLE: 'Disponible', EN_USO: 'En uso', BLOQUEADA: 'Disponibilidad autom?tica', ASISTENCIA: 'Suspendida · operación activa', FUERA_DE_SERVICIO: 'Fuera de servicio' };
    document.querySelector('#content').innerHTML = `${heading('EQUIPOS', 'Terminales y surtidores', 'Estado de solo lectura. FuelFlow inicia automáticamente; se conservan las intervenciones de seguridad.')}
      <section class="panel table-wrap"><div class="panel-head"><h2>Terminales</h2></div><table><thead><tr><th>Estación</th><th>Terminal</th><th>Estado actual</th><th>Surtidor</th><th>Operación</th><th>Última actividad</th><th>Cambio por</th><th>Motivo de suspensión</th><th>Acción</th></tr></thead><tbody>${terminals.map((terminal) => {
        const operation = terminal.operations[0];
        const enabled = ['DISPONIBLE', 'EN_USO'].includes(terminal.operationalStatus);
        const action = '<span class="muted">Disponibilidad automática</span>';
        const needsRecovery = operation && (operation.status === 'INTERVENTION_REQUIRED' || ['ASISTENCIA', 'FUERA_DE_SERVICIO'].includes(terminal.operationalStatus));
        const recovery = needsRecovery && has('ADMIN_INCIDENT_MANAGE')
          ? `<button class="text-button" data-operation-resolve="${esc(operation.operationId)}">Resolver operación</button>` : '';
        return `<tr><td>${esc(terminal.station.name)}</td><td>${esc(terminal.code)}</td><td><span class="badge ${enabled ? '' : 'warning'}">${esc(status[terminal.operationalStatus] || terminal.operationalStatus)}</span></td><td>${esc(terminal.assignments[0]?.pump?.code || 'Sin asignar')}</td><td>${operation ? `${esc(operation.number || "Sin correlativo")}` : '—'}</td><td>${stamp(terminal.credentials[0]?.lastUsedAt || terminal.statusChangedAt)}</td><td>${esc(terminal.statusChangedBy || '—')}</td><td>${esc(terminal.suspensionReason || '—')}</td><td>${action}${recovery}</td></tr>`;
      }).join('') || '<tr><td colspan="9">No hay terminales para este alcance.</td></tr>'}</tbody></table></section>
      <section class="panel table-wrap"><div class="panel-head"><h2>Surtidores</h2></div><table><thead><tr><th>Estación</th><th>Surtidor</th><th>Nombre</th><th>Terminal asignada</th></tr></thead><tbody>${pumps.map((pump) => `<tr><td>${esc(pump.station.name)}</td><td>${esc(pump.code)}</td><td>${esc(pump.name)}</td><td>${esc(pump.assignments[0]?.terminal?.code || 'Sin asignar')}</td></tr>`).join('') || '<tr><td colspan="4">No hay surtidores activos.</td></tr>'}</tbody></table></section>`;
  } catch (error) { showError(error); }
}

async function renderInventory() {
  loading('Consultando inventario…');
  try {
    const suffix = selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : '';
    inventoryRows = await api(`/control/inventory${suffix}`);
    document.querySelector('#content').innerHTML = `${heading('EXISTENCIAS', 'Inventario', 'Disponible = litros físicos − litros reservados. El sistema mantiene el registro de movimientos.')}<section class="panel table-wrap"><table><thead><tr><th>Estación</th><th>Combustible</th><th>Físico L</th><th>Reservado L</th><th>Disponible L</th><th>Estado</th><th>Última actualización</th><th>Acciones</th></tr></thead><tbody>${inventoryRows.map((row) => `<tr class="${row.activation?.status === 'REVIEW' ? 'review-row' : ''}"><td>${esc(row.station.name)}</td><td>${esc(row.fuel.name)}</td><td>${fmt(row.liters, 3)}</td><td>${fmt(row.reservedLiters, 3)}</td><td><strong>${fmt(row.availableLiters, 3)}</strong></td><td><span class="badge ${row.activation?.status === 'REVIEW' ? 'warning' : ''}">${esc(statusLabel(row.activation?.status))}</span>${row.activation?.reason ? `<small class="subcell">${esc(row.activation.reason)}</small>` : ''}</td><td>${stamp(row.updatedAt)}</td><td><button class="text-button" data-inspect-pair="${row.stationId}:${row.fuelId}">Ver conciliación</button>${has('ADMIN_INVENTORY_RECONCILE') && row.activation?.status === 'REVIEW' ? `<button class="text-button" data-reconcile="${row.stationId}:${row.fuelId}">Reconciliar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8">No hay inventario en este alcance.</td></tr>'}</tbody></table></section><dialog id="reconciliation-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderMovements(filters = {}) {
  loading('Consultando movimientos…');
  const stationId = filters.stationId ?? selectedStation;
  if (!stationId) { document.querySelector('#content').innerHTML = `${heading('MOVIMIENTOS', 'Movimientos')}${panel('Selecciona una estación para consultar sus movimientos.')}`; return; }
  try {
    const movements = await api(`/control/inventory/movements?${queryString({ stationId, fuelId: filters.fuelId, kind: filters.kind, from: filters.from, to: filters.to })}`);
    const fuels = inventoryRows.filter((row) => row.stationId === stationId);
    document.querySelector('#content').innerHTML = `${heading('SOLO LECTURA', 'Movimientos de inventario', 'Esta vista es de solo lectura; los movimientos no se editan ni eliminan.')}<form id="movement-filters" class="filter-bar"><label>Combustible<select name="fuelId"><option value="">Todos</option>${fuels.map((row) => `<option value="${row.fuelId}" ${filters.fuelId === row.fuelId ? 'selected' : ''}>${esc(row.fuel.name)}</option>`).join('')}</select></label><label>Tipo<select name="kind"><option value="">Todos</option>${['OPENING_BALANCE','RESERVE','DISPENSE','LEGACY_DISPENSE','RELEASE','ADJUST_IN','ADJUST_OUT'].map((kind) => `<option ${filters.kind === kind ? 'selected' : ''}>${movementKindLabel(kind)}</option>`).join('')}</select></label>${dateInputs(filters)}<button class="secondary">Filtrar</button></form><section class="panel table-wrap movement-table"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Combustible</th><th>Variación física (L)</th><th>Variación reservada (L)</th><th>Físico posterior (L)</th><th>Reserva posterior (L)</th><th>Operación</th><th>Referencia</th></tr></thead><tbody>${movements.map((item) => `<tr><td>${stamp(item.createdAt)}</td><td><span class="badge">${esc(movementKindLabel(item.kind))}</span></td><td>${esc(item.fuel.name)}</td><td class="movement-number">${esc(formatLiters(item.physicalDeltaLiters))} L</td><td class="movement-number">${esc(formatLiters(item.reservedDeltaLiters))} L</td><td class="movement-number">${esc(formatLiters(item.litersAfter))} L</td><td class="movement-number">${esc(formatLiters(item.reservedLitersAfter))} L</td><td>${esc(item.reservation?.operationId || '—')}</td><td>${esc(item.reason || '—')}</td></tr>`).join('') || '<tr><td colspan="9">No hay movimientos.</td></tr>'}</tbody></table></section>`;
  } catch (error) { showError(error); }
}

async function renderSupply(message = '') {
  loading('Preparando abastecimiento…');
  try { inventoryRows = await api(`/control/inventory${selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : ''}`); }
  catch (error) { showError(error); return; }
  const pairs = inventoryRows;
  document.querySelector('#content').innerHTML = `${heading('SIMULACIÓN ACADÉMICA', 'Abastecimiento de inventario', 'Registra una recepción física y agrega un movimiento ADJUST_IN. No representa una compra real.')}<section class="panel form-panel"><form id="supply-form"><input type="hidden" name="requestId" value="${crypto.randomUUID()}"><label>Estación<select name="stationId" required>${pairs.map((row) => `<option value="${row.stationId}" ${row.stationId === selectedStation ? 'selected' : ''}>${esc(row.station.name)}</option>`).filter((value, index, array) => array.indexOf(value) === index).join('')}</select></label><label>Combustible<select name="fuelId" required>${pairs.map((row) => `<option value="${row.fuelId}" data-station="${row.stationId}">${esc(row.fuel.name)}</option>`).join('')}</select></label><label>Litros recibidos<input name="liters" type="number" inputmode="numeric" min="1" max="1000000" step="1" value="1" required></label><label>Referencia o nota (opcional)<input name="reference" maxlength="160" placeholder="Guía académica / recepción física"></label><p class="muted">Los litros reservados se mantienen sin cambios. El registro de movimientos conserva quién realizó el cambio y cuál fue el saldo resultante.</p><p class="success-message" role="status">${esc(message)}</p><p class="error" role="alert"></p><button class="primary" type="submit">Registrar abastecimiento</button></form></section>`;
  const form = document.querySelector('#supply-form');
  const station = form.elements.stationId;
  const fuel = form.elements.fuelId;
  function filterFuels() {
    const options = pairs.filter((pair) => pair.stationId === station.value);
    fuel.innerHTML = options.map((row) => `<option value="${row.fuelId}">${esc(row.fuel.name)}</option>`).join('');
  }
  station.addEventListener('change', filterFuels);
  filterFuels();
}

async function renderIncidents(filters = {}) {
  loading('Consultando incidencias…');
  const stationId = filters.stationId ?? selectedStation ?? (!session.global && session.stations.length === 1 ? session.stations[0].id : '');
  if (!stationId) { document.querySelector('#content').innerHTML = `${heading('SEGUIMIENTO', 'Incidencias')}${panel('Selecciona una estación autorizada para ver incidencias.')}`; return; }
  if (!canViewStation(session, stationId)) { document.querySelector('#content').innerHTML = `${heading('SEGUIMIENTO', 'Incidencias')}${panel('Estación fuera de tu alcance.', 'denied')}`; return; }
  try {
    const query = queryString({ stationId, status: filters.status });
    const rows = await api(`/control/incidents?${query}`);
    document.querySelector('#content').innerHTML = `${heading('SEGUIMIENTO', 'Incidencias', `${rows.length} registros en esta estación.`)}<form id="incident-filters" class="filter-bar"><label>Estado<select name="status"><option value="">Todos</option>${['OPEN','IN_REVIEW','RESOLVED','DISMISSED'].map((status) => `<option ${filters.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}</select></label><button class="secondary">Filtrar</button></form><section class="panel table-wrap"><table><thead><tr><th>Tipo</th><th>Resumen</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td><span class="code">${esc(row.code.replaceAll('_', '-'))}</span></td><td>${esc(row.summary)}</td><td><span class="badge">${esc(statusLabel(row.status))}</span></td><td>${stamp(row.createdAt)}</td><td><button class="text-button" data-incident="${row.id}">Detalle</button></td></tr>`).join('') || '<tr><td colspan="5">No hay incidencias.</td></tr>'}</tbody></table></section><dialog id="incident-dialog"></dialog>`;
  } catch (error) { showError(error); }
}

async function renderAccounts(message = '') {
  loading('Consultando cuentas administrativas…');
  if (!session.global) { document.querySelector('#content').innerHTML = `${heading('ACCESO', 'Personal y accesos')}${panel('Solo el Administrador del sistema puede aprobar cuentas y modificar permisos.', 'denied')}`; return; }
  try {
    accountRows = await api('/control/accounts');
    document.querySelector('#content').innerHTML = `${heading('ACCESO ADMINISTRATIVO', 'Personal y accesos', 'Cuentas, estaciones y permisos del personal autorizado.')}<section class="panel table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Correo</th><th>Estaciones</th><th>Permisos activos</th><th>Acciones</th></tr></thead><tbody>${accountRows.map((row) => `<tr><td>${esc(row.user.name)}<small class="subcell">${esc(row.user.email)}</small></td><td>${esc(roleLabel(row.role))}</td><td><span class="badge">${esc(statusLabel(row.status))}</span></td><td>${row.emailVerifiedAt ? 'Verificado' : 'Pendiente'}</td><td>${row.stations.map((item) => esc(item.station.code)).join(', ') || '—'}</td><td><small>${row.grants.map((grant) => esc(permissionLabel(grant))).join(', ') || '—'}</small></td><td>${row.status === 'PENDING_APPROVAL' ? `<button class="text-button" data-edit-account="${row.user.id}">Aprobar</button><button class="text-button" data-account-status="REJECTED" data-user="${row.user.id}">Rechazar</button>` : row.status === 'APPROVED' ? `<button class="text-button" data-edit-account="${row.user.id}">Permisos / estaciones</button><button class="text-button" data-account-status="DISABLED" data-user="${row.user.id}">Deshabilitar</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="7">Sin cuentas administrativas.</td></tr>'}</tbody></table></section><dialog id="account-dialog"></dialog>${administrativeAccountForm(session, esc, message)}`;
  } catch (error) { showError(error); }
}

async function renderAudit(filters = {}) {
  loading('Consultando auditoría…');
  try {
    const query = queryString({ stationId: filters.stationId ?? selectedStation, actorUserId: filters.actorUserId, action: filters.action, from: filters.from, to: filters.to });
    const rows = await api(`/control/audit${query ? `?${query}` : ''}`);
    document.querySelector('#content').innerHTML = `${heading('SOLO LECTURA', 'Auditoría', 'Los eventos de auditoría son de solo lectura y no pueden modificarse.')}<form id="audit-filters" class="filter-bar"><label>Actor (ID de usuario)<input name="actorUserId" value="${esc(filters.actorUserId || '')}" placeholder="UUID"></label><label>Acción<input name="action" value="${esc(filters.action || '')}" maxlength="80"></label>${dateInputs(filters)}<button class="secondary">Filtrar</button></form><section class="panel table-wrap"><table><thead><tr><th>Fecha</th><th>Estación</th><th>Actor</th><th>Acción</th><th>Resultado</th><th>Destino</th><th>Contexto</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${stamp(row.createdAt)}</td><td>${esc(row.station?.name || 'Global')}</td><td>${esc(row.actorUser?.name || row.actorKind)}</td><td>${esc(row.action)}</td><td><span class="badge">${esc(row.outcome)}</span></td><td>${esc(row.targetId || row.terminal?.code || '—')}</td><td>${esc(JSON.stringify(row.details || {}))}</td></tr>`).join('') || '<tr><td colspan="7">No hay eventos.</td></tr>'}</tbody></table></section>`;
  } catch (error) { showError(error); }
}

async function renderView(view, filters = {}) {
  if (view === 'assistance') { document.querySelector('#content').innerHTML = heading('ASISTENCIA', 'Solicitudes e historial') + '<section class="panel" id="assistance-panel"></section>'; return assistancePanel({ api, stationId: selectedStation, userId: session.user.id, canManage: has('ADMIN_INCIDENT_MANAGE'), notificationOpen: openAssistanceRequest }); }
  if (view === 'dashboard') return renderDashboard();
  if (view === 'operations') return renderOperations(filters);
  if (view === 'transactions') return renderTransactions(filters);
  if (view === 'customers') return renderCustomers(filters);
  if (view === 'memberships') return renderMemberships(filters);
  if (view === 'vehicles') return renderVehicles(filters);
  if (view === 'terminals') return renderTerminals();
  if (view === 'inventory') return renderInventory();
  if (view === 'movements') {
    if (!inventoryRows.length) inventoryRows = await api(`/control/inventory${selectedStation ? `?stationId=${encodeURIComponent(selectedStation)}` : ''}`);
    return renderMovements(filters);
  }
  if (view === 'supply') return renderSupply();
  if (view === 'incidents') return renderIncidents(filters);
  if (view === 'accounts') return renderAccounts();
  if (view === 'audit') return renderAudit(filters);
}

async function route(filters = {}) {
  stopAssistancePolling();
  let view = initialView(location.hash);
  if (view === 'dashboard' && !visibleModules(session).some(([id]) => id === 'dashboard')) view = defaultView(session);
  const routeItem = nav.find(([id]) => id === view);
  if (!routeItem || !visibleModules(session).some(([id]) => id === view)) {
    app.innerHTML = `${heading('ACCESO', 'Acceso denegado')}${panel('Tu cuenta no tiene permiso para abrir esta sección.', 'denied')}`;
    return;
  }
  shell(view);
  try { await renderView(view, filters); }
  catch (error) { showError(error); }
}

async function boot() {
  const parts = location.hash.split('?');
  if (parts[0] === '#/verify') {
    try {
      const token = new URLSearchParams(parts[1] || '').get('token');
      if (!token) throw new Error('El enlace no contiene un token válido.');
      const result = await api('/control/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
      history.replaceState(null, '', `${location.pathname}${location.search}#login`);
      login(result.message);
    } catch (error) { login(incidentMessage(error)); }
    return;
  }
  if (location.hash === '#request-access') { requestAccess(); return; }
  try { session = await apiClient.session(); if (!location.hash) location.hash = `#${defaultView(session)}`; await route(); }
  catch (error) { session = null; resetAssistanceNotifications(); login(error.status === 403 ? 'Esta cuenta no tiene acceso aprobado a Primax Control.' : 'Inicia sesión para continuar.'); }
}

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!input.matches?.('[data-date-input]')) return;
  input.setCustomValidity(parseDisplayDate(input.value) === null ? 'Ingresa una fecha válida con el formato dd/mm/aaaa.' : '');
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (busy) return;
  if (['login-form', 'request-form'].includes(form.id)) {
    event.preventDefault(); busy = true;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Validando…';
    try {
      if (form.id === 'request-form') {
        const result = await api('/control/access-requests', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        history.replaceState(null, '', `${location.pathname}${location.search}#login`); login(result.message);
      } else {
        session = await apiClient.login(Object.fromEntries(new FormData(form)));
        location.hash = `#${defaultView(session)}`; await route();
      }
    } catch (error) { form.id === 'request-form' ? requestAccess(incidentMessage(error)) : login(incidentMessage(error)); }
    finally { busy = false; }
    return;
  }
  if (form.id === 'admin-create-form') {
    event.preventDefault();
    if (!session?.global || session.role !== 'SUPER_ADMIN') return;
    busy = true;
    const button = form.querySelector('button[type="submit"]');
    const errorBox = form.querySelector('[role="alert"]');
    button.disabled = true;
    const data = new FormData(form);
    const body = { name: data.get('name'), email: data.get('email'), password: data.get('password'), role: data.get('role'), stationIds: data.getAll('stationIds'), permissions: data.getAll('permissions') };
    try {
      await api('/control/accounts', { method: 'POST', body: JSON.stringify(body) });
      form.elements.password.value = '';
      await renderAccounts('Cuenta administrativa creada correctamente.');
    } catch (error) {
      form.elements.password.value = '';
      errorBox.textContent = incidentMessage(error);
      button.disabled = false;
    } finally {
      body.password = '';
      busy = false;
    }
    return;
  }
  const filterViews = { 'operation-filters': renderOperations, 'transaction-filters': renderTransactions, 'customer-filters': renderCustomers, 'membership-filters': renderMemberships, 'vehicle-filters': renderVehicles, 'movement-filters': renderMovements, 'incident-filters': renderIncidents, 'audit-filters': renderAudit };
  const filter = filterViews[form.id];
  if (filter) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    for (const input of form.querySelectorAll('[data-date-input]')) {
      const apiDate = parseDisplayDate(input.value);
      if (apiDate === null) {
        input.setCustomValidity('Ingresa una fecha válida con el formato dd/mm/aaaa.');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      values[input.name] = apiDate;
    }
    if (!values.stationId) values.stationId = selectedStation;
    await filter(values);
    return;
  }
  if (form.id === 'supply-form') {
    event.preventDefault(); busy = true;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    const errorBox = form.querySelector('.error'); const successBox = form.querySelector('.success-message'); errorBox.textContent = '';
    try {
      const body = Object.fromEntries(new FormData(form));
      const result = await api('/control/inventory/receipts', { method: 'POST', body: JSON.stringify(body) });
      await renderSupply(`Recibidos ${fmt(result.movement.physicalDeltaLiters, 3)} L. Movimiento ${result.movement.id.slice(0, 8)} registrado${result.replayed ? ' (reintento idempotente)' : ''}.`);
    } catch (error) { errorBox.textContent = incidentMessage(error); button.disabled = false; }
    finally { busy = false; }
    return;
  }
  if (form.id === 'account-access-form') {
    event.preventDefault(); busy = true;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const userId = form.dataset.userId;
      const formData = new FormData(form);
      const body = { role: formData.get('role'), stationIds: formData.getAll('stationIds'), permissions: formData.getAll('permissions') };
      await api(`/control/accounts/${userId}/${form.dataset.mode === 'approve' ? 'approve' : 'access'}`, { method: 'POST', body: JSON.stringify(body) });
      document.querySelector('#account-dialog').close(); await renderAccounts();
    } catch (error) { form.querySelector('.error').textContent = incidentMessage(error); button.disabled = false; }
    finally { busy = false; }
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.id === 'resend-link') {
    const email = window.prompt('Correo de la solicitud:'); if (!email) return;
    try { const result = await api('/control/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }); login(result.message); }
    catch (error) { login(incidentMessage(error)); }
    return;
  }
  if (target.dataset.customer) {
    try {
      const detail = await api(`/control/customers/${encodeURIComponent(target.dataset.customer)}`);
      const dialog = document.querySelector('#customer-dialog');
      const membership = detail.membership ? `<section class="panel"><h3>Membresía Prime</h3><p>${esc(detail.membership.number)} · ${esc(statusLabel(detail.membership.status))}</p>${detail.membership.balance != null ? `<p>Saldo real: S/ ${fmt(detail.membership.balance)} · puntos ${fmt(detail.membership.points, 0)}</p>` : '<p class="muted">El saldo no se expone fuera del alcance global.</p>'}</section>` : '<p class="muted">Sin permiso para ver membresía o sin membresía asociada.</p>';
      dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">DETALLE DEL CLIENTE</p><h2>${esc(detail.name)}</h2><p>${esc(detail.email)} · ${detail.active ? 'Activo' : 'Inactivo'} · registrado ${dateLabel(detail.registeredAt)}</p>${membership}<section class="customer-detail-section"><h3>Vehículos visibles en este alcance</h3><div class="customer-vehicles">${detail.vehicles.map((vehicle) => `<div class="customer-vehicle"><strong class="mono">${esc(vehicle.plate)}</strong><span>${esc(vehicle.label)}</span></div>`).join('') || '<p class="muted">No hay vehículos visibles.</p>'}</div></section><section class="customer-detail-section"><h3>Actividad y operaciones visibles</h3><div class="customer-operations">${detail.operations.map((row) => `<article class="customer-operation"><div class="customer-operation-head"><div><span class="field-label">Fecha</span><strong>${stamp(row.occurredAt)}</strong></div><span class="badge">${esc(paymentLabel(row.financialStatus))}</span></div><div class="customer-operation-grid"><div><span class="field-label">Operación</span><span class="mono">${esc(row.number || "Sin correlativo")}</span></div><div><span class="field-label">Estación</span><span>${esc(row.station.name)}</span></div><div><span class="field-label">Placa</span><span class="mono">${esc(row.plate)}</span></div><div><span class="field-label">Estado físico</span><span class="badge">${esc(paymentLabel(row.physicalStatus))}</span></div><div><span class="field-label">Comprobante</span><span class="mono">${esc(row.receipt?.number || 'Sin comprobante')}</span></div></div><div class="customer-operation-actions"><details><summary>Identificador completo</summary><code class="mono">${esc(row.operationId)}</code><button type="button" class="text-button" data-copy-operation="${esc(row.operationId)}">Copiar</button></details>${row.transactionId && has('ADMIN_RECEIPT_VIEW') ? `<button type="button" class="secondary" data-show-receipt="${esc(row.transactionId)}">Ver comprobante</button>` : ''}</div></article>`).join('') || '<p class="muted">No hay operaciones visibles.</p>'}</div></section>`;
      dialog.showModal();
    } catch (error) { window.alert(incidentMessage(error)); }
  }
  if (target.dataset.copyOperation) {
    try { await navigator.clipboard.writeText(target.dataset.copyOperation); target.textContent = 'Copiado'; }
    catch { window.alert('No se pudo copiar. Selecciona el identificador completo para copiarlo.'); }
    return;
  }
  if (target.dataset.showReceipt) await showReceipt(target.dataset.showReceipt);
  if (target.dataset.transaction) {
    try {
      const detail = await api(`/control/transactions/${encodeURIComponent(target.dataset.transaction)}`);
      const dialog = document.querySelector('#transaction-dialog');
      dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">PAGO Y TRANSACCIÓN</p><p>Número de operación</p><h2 class="mono operation-full-id">${esc(detail.number || "Sin correlativo")}</h2><p class="muted mono">UUID técnico: ${esc(detail.operationId)}</p><button type="button" class="text-button" data-copy-operation="${esc(detail.operationId)}">Copiar identificador completo</button><dl><dt>Estación</dt><dd>${esc(detail.station.name)}</dd><dt>Cliente</dt><dd>${esc(detail.customer?.name || 'Cliente no vinculado')}</dd><dt>Vehículo / placa</dt><dd>${esc(detail.vehicle?.label || '—')} · ${esc(detail.plate)}</dd><dt>Combustible</dt><dd>${esc(detail.fuel.name)}</dd><dt>Comprobante</dt><dd>${esc(detail.receipt?.number || 'Sin comprobante')}</dd><dt>Modalidad</dt><dd>${esc(detail.mode)}</dd><dt>Pago</dt><dd>${esc(paymentLabel(detail.financialStatus))} · ${esc(detail.method || 'Sin método')}</dd><dt>Estado físico</dt><dd>${esc(paymentLabel(detail.physicalStatus))}</dd><dt>Importe / cantidad</dt><dd>S/ ${fmt(detail.amount)} · ${fmt(detail.gallons, 3)} gal</dd><dt>Incidencias</dt><dd>${detail.incidents.map((incident) => `${esc(incident.code)} · ${esc(statusLabel(incident.status))}`).join(', ') || 'Ninguna registrada'}</dd></dl><p class="muted">Los estados se consultan en el sistema. Control no permite marcar pagos como completados.</p>${has('ADMIN_RECEIPT_VIEW') ? `<button class="primary" data-show-receipt="${detail.transactionId}">Ver comprobante académico</button>` : ''}`;
      dialog.showModal();
    } catch (error) { window.alert(incidentMessage(error)); }
  }
  if (target.dataset.operation) {
    try {
      const detail = await api(`/control/operations/${encodeURIComponent(target.dataset.operation)}`);
      const dialog = document.querySelector('#operation-dialog');
      dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">DETALLE DE OPERACIÓN</p><p>Número de operación</p><h2 class="mono operation-full-id">${esc(detail.number || "Sin correlativo")}</h2><p class="muted mono">UUID técnico: ${esc(detail.operationId)}</p><button type="button" class="text-button" data-copy-operation="${esc(detail.operationId)}">Copiar identificador completo</button><dl><dt>Estación</dt><dd>${esc(detail.station?.name || '—')}</dd><dt>Terminal / surtidor</dt><dd>${esc(detail.terminalOperation?.terminal?.code || '—')} / ${esc(detail.terminalOperation?.pump?.code || '—')}</dd><dt>Combustible</dt><dd>${esc(detail.fuel?.name || '—')}</dd><dt>Estado físico</dt><dd>${esc(operationDetailStatusLabel(detail.terminalOperation?.status ? "operation" : "authorization", detail.terminalOperation?.status || detail.authorization?.status))}</dd><dt>Estado financiero</dt><dd>${esc(operationDetailStatusLabel(detail.payment?.status ? "payment" : "sale", detail.payment?.status || detail.transaction?.status))}</dd><dt>Pago / reembolso</dt><dd>${detail.payment ? `${fmt(detail.payment.amount)} · reembolsado ${fmt(detail.payment.refundedAmount)}` : '—'}</dd><dt>Despacho</dt><dd>${fmt(detail.authorization?.dispensedGallons, 3)} gal · ${fmt(detail.authorization?.dispensedAmount)} PEN</dd><dt>Reserva</dt><dd>${detail.reservation ? `${esc(operationDetailStatusLabel("reservation", detail.reservation.status))} · inicial ${fmt(detail.reservation.initialLiters, 3)} L · pendiente ${fmt(detail.reservation.remainingLiters, 3)} L` : '—'}</dd><dt>Incidencia</dt><dd>${detail.incident ? `${esc(detail.incident.code)} · ${esc(statusLabel(detail.incident.status))}` : '—'}</dd></dl><h3>Movimientos de la reserva</h3><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Variación física (L)</th><th>Variación reservada (L)</th><th>Físico posterior (L)</th></tr></thead><tbody>${(detail.reservation?.movements || []).map((move) => `<tr><td>${stamp(move.createdAt)}</td><td>${esc(movementKindLabel(move.kind))}</td><td class="movement-number">${esc(formatLiters(move.physicalDeltaLiters))} L</td><td class="movement-number">${esc(formatLiters(move.reservedDeltaLiters))} L</td><td class="movement-number">${esc(formatLiters(move.litersAfter))} L</td></tr>`).join('') || '<tr><td colspan="5">Sin movimientos de reserva.</td></tr>'}</tbody></table></div>`;
      dialog.insertAdjacentHTML('beforeend', `<p>Comprobante: <strong class="mono">${esc(detail.receipt?.number || 'Sin comprobante')}</strong></p>`);
      if (session.global && session.role === 'SUPER_ADMIN' && detail.terminalOperation?.status === 'ACTIVE') {
        dialog.insertAdjacentHTML('beforeend', '<section class="recovery-control"><h3>Recuperación administrativa</h3><p>Emite un código de un uso para esta operación. No cancela pagos ni cierra la atención.</p><button type="button" class="secondary" data-request-recovery>Solicitar código de recuperación</button><div data-recovery-result></div></section>');
        dialog.querySelector('[data-request-recovery]').addEventListener('click', () => {
          const holder = dialog.querySelector('[data-recovery-result]');
          holder.innerHTML = '<form data-recovery-form><label>Justificación de la recuperación<textarea name="reason" required minlength="10" maxlength="200" rows="3" autocomplete="off"></textarea></label><button type="submit" class="primary">Emitir código para esta operación</button><p class="error" role="alert"></p></form>';
          const form = holder.querySelector('form');
          form.addEventListener('submit', async event => {
            event.preventDefault();
            const reason = form.elements.reason.value.trim();
            if (reason.length < 10) { form.querySelector('[role="alert"]').textContent = 'Explica el motivo con al menos diez caracteres.'; return; }
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            form.querySelector('[role="alert"]').textContent = '';
            try {
              const issued = await api(`/control/terminal-operations/${encodeURIComponent(detail.operationId)}/recovery-ticket`, { method: 'POST', body: JSON.stringify({ reason }) });
              if (issued.operationId !== detail.operationId || issued.terminalCode !== detail.terminalOperation.terminal.code || !/^[A-Za-z0-9_-]{43}$/.test(issued.ticket || ''))
                throw Error('La respuesta no corresponde a esta terminal. Solicita asistencia.');
              dialog.querySelector('[data-request-recovery]').disabled = true;
              holder.innerHTML = '<p>Código para <strong data-recovery-terminal></strong>. Vence en cinco minutos y solo funciona una vez.</p><label>Código de recuperación<input data-recovery-code readonly autocomplete="off" spellcheck="false"></label><button type="button" class="secondary" data-copy-recovery>Copiar código</button><p data-recovery-link></p><p class="muted">Pégalo en “Recuperación administrativa” de la terminal indicada. No uses el código en otra terminal.</p>';
              holder.querySelector('[data-recovery-terminal]').textContent = issued.terminalCode;
              const input = holder.querySelector('[data-recovery-code]');
              input.value = issued.ticket;
              holder.querySelector('[data-copy-recovery]').addEventListener('click', () => { void navigator.clipboard.writeText(input.value); });
              const origin = recoveryTerminalOrigin(issued.terminalCode);
              if (origin) {
                const link = document.createElement('a');
                link.href = origin;
                link.target = '_blank'; link.rel = 'noopener noreferrer';
                link.textContent = `Abrir ${issued.terminalCode} en FuelFlow`;
                holder.querySelector('[data-recovery-link]').append(link);
              }
              const timer = setTimeout(() => { input.value = ''; holder.querySelector('[data-copy-recovery]').disabled = true; holder.querySelector('.muted').textContent = 'Código vencido. Solicita uno nuevo si sigue siendo necesario.'; dialog.querySelector('[data-request-recovery]').disabled = false; }, 300000);
              dialog.addEventListener('close', () => { clearTimeout(timer); input.value = ''; holder.replaceChildren(); }, { once: true });
            } catch (error) { form.querySelector('[role="alert"]').textContent = incidentMessage(error); submit.disabled = false; }
          });
        });
      }
      dialog.showModal();
    } catch (error) { window.alert(incidentMessage(error)); }
  }
  if (target.dataset.incident) {
    try {
      const detail = await api(`/control/incidents/${encodeURIComponent(target.dataset.incident)}`);
      const isInc001 = detail.code === 'INC_001';
      const dialog = document.querySelector('#incident-dialog');
      dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">${esc(detail.code.replaceAll('_', '-'))}</p><h2>${esc(detail.summary)}</h2><p>${esc(statusLabel(detail.status))}</p>${isInc001 ? '<section class="incident-notice"><strong>Pago confirmado · despacho cero · operación detenida.</strong><br>Resolver esta incidencia no reembolsa el pago.</section>' : ''}<dl><dt>Operación</dt><dd>${esc(detail.operationId || '—')}</dd><dt>Pago</dt><dd>${esc(statusLabel(detail.payment?.status))} ${detail.payment ? `· ${fmt(detail.payment.amount)} · reembolso ${fmt(detail.payment.refundedAmount)}` : ''}</dd><dt>Despacho</dt><dd>${esc(detail.authorization?.dispensedAmount ?? '—')} PEN · ${esc(detail.authorization?.dispensedGallons ?? '—')} gal</dd><dt>Resolución</dt><dd>${esc(detail.resolution || 'Pendiente')}</dd></dl>${has('ADMIN_INCIDENT_MANAGE') && ['OPEN','IN_REVIEW'].includes(detail.status) ? `<div class="actions">${detail.status === 'OPEN' ? '<button class="secondary" data-incident-status="IN_REVIEW">Iniciar revisión</button>' : '<button class="primary" data-incident-status="RESOLVED">Resolver</button>'}<button class="quiet" data-incident-status="DISMISSED">Descartar</button></div>` : ''}`;
      dialog.showModal();
      dialog.querySelectorAll('[data-incident-status]').forEach((button) => button.addEventListener('click', async () => {
        const reason = button.dataset.incidentStatus === 'IN_REVIEW' ? 'Revisión administrativa iniciada' : window.prompt('Motivo de resolución o descarte:');
        if (!reason) return; button.disabled = true;
        try { await api(`/control/incidents/${detail.id}/status`, { method: 'POST', body: JSON.stringify({ status: button.dataset.incidentStatus, reason }) }); dialog.close(); await renderIncidents(); }
        catch (error) { window.alert(incidentMessage(error)); button.disabled = false; }
      }));
    } catch (error) { window.alert(incidentMessage(error)); }
  }
  if (target.dataset.operationResolve) {
    const reason = window.prompt('Resultado de la intervención:');
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm('Se cerrará la operación activa después de verificar que no haya pagos ni reservas pendientes. ¿Continuar?')) return;
    target.disabled = true;
    try { await api(`/control/terminal-operations/${target.dataset.operationResolve}/resolve`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) }); await renderTerminals(); }
    catch (error) { target.disabled = false; window.alert(incidentMessage(error)); }
  }
  if (target.dataset.inspectPair || target.dataset.reconcile) {
    const pair = (target.dataset.inspectPair || target.dataset.reconcile).split(':');
    try {
      if (target.dataset.reconcile) {
        if (!window.confirm('La conciliación inspecciona los movimientos y compromisos anteriores; no ajustará los litros físicos. ¿Continuar?')) return;
        target.disabled = true;
        const result = await api(`/control/inventory/${pair[0]}/${pair[1]}/reconcile`, { method: 'POST' });
        window.alert(`Conciliación terminada: ${result.status}. Incidencias en los movimientos: ${result.issues.length}.`);
        await renderInventory();
      } else {
        const report = await api(`/control/inventory/${pair[0]}/${pair[1]}/reconciliation`);
        const dialog = document.querySelector('#reconciliation-dialog');
        dialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><p class="eyebrow">CONCILIACIÓN · SOLO INSPECCIÓN</p><h2>${esc(statusLabel(report.status))}</h2><p>${esc(report.reason || 'Sin razón de revisión registrada')}</p><dl><dt>Físico</dt><dd>${esc(report.physicalLiters)} L</dd><dt>Reservado</dt><dd>${esc(report.reservedLiters)} L</dd><dt>Disponible</dt><dd>${esc(report.availableLiters)} L</dd><dt>Reservas abiertas</dt><dd>${esc(report.openReservationLiters)} L</dd><dt>Movimientos</dt><dd>${report.movementCount}</dd></dl><h3>Hallazgos</h3><ul>${report.issues.map((issue) => `<li class="mono">${esc(issue)}</li>`).join('') || '<li>Sin hallazgos.</li>'}</ul><p class="muted">La inspección no modifica el stock físico.</p>`;
        dialog.showModal();
      }
    } catch (error) { if (target.dataset.reconcile) target.disabled = false; window.alert(incidentMessage(error)); }
  }
  if (target.dataset.editAccount) {
    const account = accountRows.find((row) => row.user.id === target.dataset.editAccount); if (!account) return;
    const dialog = document.querySelector('#account-dialog');
    const currentStations = account.stations.map((item) => item.stationId);
    const currentPermissions = account.grants || [];
    const grantGroups = permissionGroups.map(([title, entries]) => [title, entries.filter(([permission]) => session.permissions.includes(permission))]);
    dialog.innerHTML = `<form id="account-access-form" data-user-id="${account.user.id}" data-mode="${account.status === 'PENDING_APPROVAL' ? 'approve' : 'update'}"><button type="button" class="close" data-close-account aria-label="Cerrar">×</button><p class="eyebrow">PERMISOS Y ALCANCE</p><h2>${account.status === 'PENDING_APPROVAL' ? 'Aprobar cuenta' : 'Actualizar cuenta'}</h2><p>${esc(account.user.name)} · ${esc(account.user.email)}</p><label>Rol<select name="role"><option value="ENCARGADO" ${account.role === 'ENCARGADO' ? 'selected' : ''}>Encargado</option><option value="ADMIN" ${account.role === 'ADMIN' ? 'selected' : ''}>Administrador</option></select></label><h3>Estaciones permitidas</h3><div class="check-list">${session.stations.map((station) => `<label><input type="checkbox" name="stationIds" value="${station.id}" ${currentStations.includes(station.id) ? 'checked' : ''}>${esc(station.name)} · ${esc(station.code)}</label>`).join('')}</div><h3>Permisos</h3><div class="permission-groups">${grantGroups.map(([title, entries]) => `<div class="permission-group"><h3>${esc(title)}</h3>${entries.map(([permission, label]) => `<label><input type="checkbox" name="permissions" value="${permission}" ${currentPermissions.includes(permission) || ['ADMIN_CONTROL_ACCESS','ADMIN_DASHBOARD_VIEW'].includes(permission) ? 'checked' : ''} ${['ADMIN_CONTROL_ACCESS','ADMIN_DASHBOARD_VIEW'].includes(permission) ? 'required' : ''}>${esc(label)}</label>`).join('')}</div>`).join('')}</div><p class="error" role="alert"></p><button class="primary" type="submit">Guardar acceso</button></form>`;
    dialog.showModal();
  }
  if (target.dataset.closeAccount !== undefined) document.querySelector('#account-dialog')?.close();
  if (target.dataset.accountStatus) {
    const isReject = target.dataset.accountStatus === 'REJECTED';
    const reason = window.prompt(isReject ? 'Motivo del rechazo:' : 'Motivo para deshabilitar:');
    if (!reason || reason.trim().length < 3) return;
    if (!isReject && !window.confirm('Se deshabilitará esta cuenta y se invalidarán sus sesiones. ¿Continuar?')) return;
    const password = isReject ? undefined : await new Promise((resolve) => {
      const dialog = document.querySelector('#account-dialog');
      dialog.innerHTML = '<form method="dialog"><h2>Confirma tu identidad</h2><label>Contraseña del Administrador del sistema<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label><div class="dialog-actions"><button type="submit" value="confirm" class="primary">Deshabilitar cuenta</button><button type="button" class="secondary" data-cancel-disable>Cancelar</button></div></form>';
      dialog.returnValue = '';
      dialog.querySelector('[data-cancel-disable]').onclick = () => dialog.close('cancel');
      dialog.addEventListener('close', () => {
        const value = dialog.returnValue === 'confirm' ? dialog.querySelector('[name=password]').value : null;
        dialog.replaceChildren();
        resolve(value);
      }, { once: true });
      dialog.showModal();
    });
    if (!isReject && !password) return;
    try { await api(`/control/accounts/${target.dataset.user}/${isReject ? 'reject' : 'disable'}`, { method: 'POST', body: JSON.stringify({ reason: reason.trim(), ...(!isReject ? { password } : {}) }) }); await renderAccounts(); }
    catch (error) { window.alert(incidentMessage(error)); }
  }
});

window.addEventListener('hashchange', () => { if (session) void route(); else if (location.hash === '#request-access') requestAccess(); else if (location.hash === '#login' || !location.hash) login(); });
void boot();
