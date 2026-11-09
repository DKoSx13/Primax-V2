import test from 'node:test';
import assert from 'node:assert/strict';

test('temporary contention retries automatically without requiring an update button', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = { document: globalThis.document, fetch: globalThis.fetch, auth: globalThis.FUELFLOW_KIOSK_AUTH };
  let bootstrapCalls = 0;
  let click;
  let dialog;
  const button = { disabled: false, addEventListener: (_event, handler) => { click = handler; } };
  const note = { textContent: '' };
  const title = { textContent: '' };
  const inert = { hidden: true, addEventListener: () => {} };
  try {
    globalThis.FUELFLOW_KIOSK_AUTH = true;
    globalThis.document = {
      body: { append: (node) => { dialog = node; } },
      createElement: () => ({
        className: '', innerHTML: '', setAttribute: () => {}, showModal: () => {},
        close: () => {}, remove: () => {}, addEventListener: () => {},
        querySelector: (selector) => selector === 'button' || selector === '[data-retry]' ? button : selector === 'h1' ? title : selector === '.terminal-access-note' ? note : inert,
      }),
    };
    globalThis.fetch = async (path) => {
      if (path === '/api/kiosk/session') return { ok: true, json: async () => ({ authenticated: false }) };
      if (path === '/api/kiosk/terminal-bootstrap') {
        bootstrapCalls++;
        return bootstrapCalls === 1
          ? { ok: false, json: async () => ({ message: 'Terminal temporalmente no disponible' }) }
          : { ok: true, json: async () => ({ authenticated: true, stationId: 'station', csrfToken: 'csrf' }) };
      }
      assert.equal(path, '/api/v1/terminal/me');
      return { ok: true, json: async () => ({ prepared: true }) };
    };
    const { ensureKioskSession } = await import(`../src/js/kioskSession.js?test=${Date.now()}`);
    const pending = ensureKioskSession();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(dialog.innerHTML, /Comprobando terminal/);
    assert.doesNotMatch(dialog.innerHTML, /Actualizar estado/);
    assert.match(title.textContent, /Recuperando disponibilidad/);
    assert.equal(button.disabled, false);
    assert.equal(note.textContent, 'Terminal temporalmente no disponible');
    assert.equal(typeof click,'function'); // Manual retry remains optional.
    t.mock.timers.tick(15000);
    await pending;
    assert.equal(bootstrapCalls, 2);
  } finally {
    globalThis.document = original.document;
    globalThis.fetch = original.fetch;
    globalThis.FUELFLOW_KIOSK_AUTH = original.auth;
  }
});
