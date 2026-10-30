// Kiosk and terminal credentials remain in HttpOnly cookies; JavaScript only sees status.
let current = null;
let waiting = null;
export const kioskAuthEnabled = () => globalThis.FUELFLOW_KIOSK_AUTH === true;
export const kioskStationId = () => current?.authenticated ? current.stationId : undefined;
async function sessionRequest(path, body) {
  const response = await fetch('/api/kiosk/session' + path, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-FuelFlow-Request': '1', ...(body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': current?.csrfToken || '' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.message || 'No se pudo verificar la sesión');
  return value;
}
async function terminalReady() {
  try {
    const response = await fetch('/api/v1/terminal/me', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { ...kioskHeaders() },
    });
    return response.ok && (await response.json()).prepared === true;
  } catch { return false; }
}
export function kioskHeaders() {
  return kioskAuthEnabled() ? { 'X-FuelFlow-Request': '1', 'X-CSRF-Token': current?.csrfToken || '' } : {};
}
export function expireKioskSession() {
  if (!kioskAuthEnabled()) return;
  current = null;
  void ensureKioskSession();
}
export async function refreshKioskSession() {
  if (!kioskAuthEnabled()) return;
  const refreshed = await sessionRequest('');
  current = refreshed;
  if (!refreshed.authenticated) {
    supervisorRecovery();
    throw Error('La sesión técnica venció. Solicita asistencia al Supervisor.');
  }
}
export function supervisorRecovery() {
  location.hash = '#supervisor-access';
  void ensureKioskSession();
}
export function ensureKioskSession() {
  if (!kioskAuthEnabled()) return Promise.resolve();
  const handoffTicket = new URLSearchParams(location.hash.slice(1)).get('control-start');
  if (handoffTicket) history.replaceState(null, '', location.pathname + location.search);
  const adminButton = document.getElementById('btn-admin-open');
  if (adminButton) adminButton.hidden = true;
  if (!handoffTicket && location.hash !== '#supervisor-access' && current?.authenticated && current.expiresAt > Date.now()) return Promise.resolve();
  if (waiting) return waiting;
  waiting = new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'terminal-access';
    dialog.setAttribute('aria-label', 'Estado de la terminal');
    dialog.addEventListener('cancel', event => event.preventDefault());
    document.body.append(dialog);
    dialog.showModal();
    const unavailable = () => {
      dialog.innerHTML = '<div class="terminal-access-card"><div class="terminal-access-brand">PRIMAX <span>FuelFlow</span></div><div class="terminal-access-icon" aria-hidden="true">⛽</div><h1>Terminal no disponible</h1><p>Solicita asistencia al personal de la estación.</p><p class="terminal-access-note">El Supervisor puede iniciar la estación desde Primax Control.</p></div>';
    };
    const update = () => unavailable();
    update();
    window.addEventListener('hashchange', update);
    if (handoffTicket) {
      dialog.querySelector('.terminal-access-note').textContent = 'Preparando estación…';
      fetch('/api/v1/kiosk/session/control-handoff', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-FuelFlow-Request': '1' },
        body: JSON.stringify({ ticket: handoffTicket }), signal: AbortSignal.timeout(20000),
      }).then(async response => {
        const value = await response.json();
        if (!response.ok || value.prepared !== true) throw Error(value.message || 'No se pudo preparar la estación.');
        current = value;
        if (!await terminalReady()) throw Error('No se pudo verificar la terminal preparada.');
        dialog.close(); dialog.remove(); window.removeEventListener('hashchange', update); resolve();
      }).catch(error => { dialog.querySelector('.terminal-access-note').textContent = error.message || 'No se pudo preparar la estación. Contacta al administrador.'; });
      return;
    }
    sessionRequest('').then(async value => {
      current = value;
      if (location.hash !== '#supervisor-access' && value.authenticated && await terminalReady()) {
        dialog.close(); dialog.remove(); window.removeEventListener('hashchange', update); resolve();
      }
    }).catch(() => { current = null; });
  }).finally(() => { waiting = null; });
  return waiting;
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { if (location.hash === '#supervisor-access') void ensureKioskSession(); });
