import { terminalService } from './apiClient.js';
import { kioskAuthEnabled, setTerminalTabId } from './kioskSession.js';
import { transactionsService } from './transactionsService.js';

const TAB_KEY = 'fuelflow:tab:v1';
let releaseLock = null;
const copy = {
  es: ['Terminal en uso', 'Esta terminal está abierta en otra pestaña. Continúa allí o ciérrala para recuperar la atención.', 'Reintentar'],
  en: ['Terminal in use', 'This terminal is open in another tab. Continue there or close it to recover the session.', 'Retry'],
  qu: ['Terminal llamk’achkan', 'Kay terminal huk pestañapi kichasqa kachkan. Chaypi qatiy utaq wichq’ay, chaymanta kutichiy.', 'Yapamanta ruray'],
};
function language() {
  try { return copy[localStorage.getItem('primax_idioma')] || copy.es; }
  catch { return copy.es; }
}
function waitingDialog() {
  const [title, description, retry] = language();
  const dialog = document.createElement('dialog');
  dialog.className = 'terminal-access';
  dialog.setAttribute('aria-label', title);
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  dialog.innerHTML = `<div class="terminal-access-card"><div class="terminal-access-brand">PRIMAX <span>FuelFlow</span></div><div class="terminal-access-icon" aria-hidden="true">⛽</div><h1></h1><p></p><button class="primary" type="button"></button><p class="terminal-access-note" role="status"></p></div>`;
  dialog.querySelector('h1').textContent = title;
  dialog.querySelector('p').textContent = description;
  dialog.querySelector('button').textContent = retry;
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/** Web Locks coordinate the UI; Backend still owns the terminal operation and its Redis claim. */
export async function reserveBrowserTab() {
  if (!kioskAuthEnabled()) return;
  if (!navigator.locks?.request) throw Error('Este navegador no permite aislar pestañas de terminal. Utiliza un navegador compatible.');
  const dialog = waitingDialog();
  dialog.querySelector('button').remove(); // The browser grants this lock automatically when the other tab closes.
  await new Promise((resolve, reject) => {
    navigator.locks.request('primax-fuelflow-terminal', { mode: 'exclusive' }, async () => {
      let id = sessionStorage.getItem(TAB_KEY);
      if (!/^[0-9a-f-]{36}$/i.test(id || '')) {
        id = crypto.randomUUID();
        sessionStorage.setItem(TAB_KEY, id);
      }
      setTerminalTabId(id);
      dialog.close(); dialog.remove();
      resolve();
      await new Promise(done => { releaseLock = done; });
      releaseLock = null;
    }).catch(reject);
  });
}

/** A completed recovery no longer needs to hold the browser lock. */
export function releaseRecoveredTab() { releaseLock?.(); }

export async function claimServerTerminal() {
  if (!kioskAuthEnabled()) return;
  let dialog;
  for (;;) {
    try {
      const pending = transactionsService.current();
      const result = await terminalService.claim(pending?.operationId);
      if (!result.claimed) throw Error('La terminal no confirmó la atención.');
      dialog?.close(); dialog?.remove();
      return;
    } catch (error) {
      dialog ||= waitingDialog();
      dialog.querySelector('.terminal-access-note').textContent = error.message || 'Consulta al personal de la estación.';
      await new Promise((resolve) => dialog.querySelector('button').addEventListener('click', resolve, { once: true }));
    }
  }
}
