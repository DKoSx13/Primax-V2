import test from 'node:test';
import assert from 'node:assert/strict';

test('suspended terminal shows unavailable state and retries technical bootstrap', async () => {
  const original = { document: globalThis.document, fetch: globalThis.fetch, auth: globalThis.FUELFLOW_KIOSK_AUTH };
  let bootstrapCalls = 0;
  let click;
  let dialog;
  const button = { disabled: false, addEventListener: (_event, handler) => { click = handler; } };
  const note = { textContent: '' };
  try {
    globalThis.FUELFLOW_KIOSK_AUTH = true;
    globalThis.document = {
      body: { append: (node) => { dialog = node; } },
      createElement: () => ({
        className: '', innerHTML: '', setAttribute: () => {}, showModal: () => {},
        close: () => {}, remove: () => {}, addEventListener: () => {},
        querySelector: (selector) => selector === 'button' ? button : note,
      }),
    };
    globalThis.fetch = async (path) => {
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
    assert.match(dialog.innerHTML, /Terminal temporalmente no disponible/);
    assert.match(dialog.innerHTML, /Actualizar estado/);
    assert.equal(button.disabled, false);
    assert.equal(note.textContent, 'Terminal temporalmente no disponible');
    click();
    await pending;
    assert.equal(bootstrapCalls, 2);
  } finally {
    globalThis.document = original.document;
    globalThis.fetch = original.fetch;
    globalThis.FUELFLOW_KIOSK_AUTH = original.auth;
  }
});
