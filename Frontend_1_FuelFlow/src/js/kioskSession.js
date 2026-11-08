// Gateway and terminal credentials remain in HttpOnly cookies.
let current = null;
let waiting = null;
let heartbeat = null;
function keepSessionAlive() {
  if (heartbeat) return;
  heartbeat = setInterval(async () => {
    if (!kioskAuthEnabled() || !current?.authenticated || document.hidden) return;
    try { if (!await terminalReady()) { current = null; void ensureKioskSession(); } }
    catch { /* Temporary network failure never cancels a financial operation. */ }
  }, 30000);
  heartbeat.unref?.();
}
export const kioskAuthEnabled = () => globalThis.FUELFLOW_KIOSK_AUTH === true;
export const kioskStationId = () => current?.authenticated ? current.stationId : undefined;
async function request(path, method = 'GET') {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-FuelFlow-Request': '1', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(20000) });
  const value = await response.json();
  if (!response.ok) throw Error(value.message || 'No se pudo consultar la terminal');
  return value;
}
async function terminalReady() {
  const response = await fetch('/api/v1/terminal/me', {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: kioskHeaders(),
  });
  return response.ok && (await response.json()).prepared === true;
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
  current = await request('/api/kiosk/session');
  if (!current.authenticated) {
    current = null;
    await ensureKioskSession();
  }
}
export function terminalRecovery() {
  current = null;
  void ensureKioskSession();
}
export function ensureKioskSession() {
  if (!kioskAuthEnabled()) return Promise.resolve();
  if (waiting) return waiting;
  waiting = new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'terminal-access';
    dialog.setAttribute('aria-label', 'Estado de la terminal');
    dialog.addEventListener('cancel', event => event.preventDefault());
    document.body.append(dialog);
    dialog.showModal();
    dialog.innerHTML = '<div class="terminal-access-card"><div class="terminal-access-brand">PRIMAX <span>FuelFlow</span></div><div class="terminal-access-icon" aria-hidden="true">⛽</div><h1>Comprobando terminal…</h1><p>La disponibilidad se recupera automáticamente. Los pagos y abastecimientos pendientes se conservan.</p><button class="primary" type="button" hidden>Reintentar ahora</button><p class="terminal-access-note" role="status"></p></div>';
    const retry = dialog.querySelector('button');
    const note = dialog.querySelector('.terminal-access-note');
    const title = dialog.querySelector('h1');
    let timer;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      clearTimeout(timer);
      retry.disabled = true;
      note.textContent = 'Comprobando terminal…';
      try {
        current = await request('/api/kiosk/terminal-bootstrap', 'POST');
        if (!await terminalReady()) throw Error('Terminal temporalmente no disponible');
        dialog.close(); dialog.remove(); keepSessionAlive(); resolve();
      } catch (error) {
        current = null;
        title.textContent = 'Recuperando disponibilidad de la terminal';
        note.textContent = error.message || 'Inténtalo nuevamente.';
        retry.disabled = false;
        retry.hidden = false;
        timer = setTimeout(check, 15000);
        timer.unref?.();
      } finally {
        checking = false;
      }
    };
    retry.addEventListener('click', check);
    void check();
  }).finally(() => { waiting = null; });
  return waiting;
}
