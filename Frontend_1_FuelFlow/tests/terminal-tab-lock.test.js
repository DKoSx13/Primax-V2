import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveBrowserTab, releaseRecoveredTab } from '../src/js/terminalTab.js';

test('a second tab waits for the browser lock until a closed recovery releases it', async () => {
  const originals = Object.fromEntries(['navigator', 'document', 'localStorage', 'sessionStorage', 'FUELFLOW_KIOSK_AUTH']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const queue = [];
  let active = false;
  const locks = { request(_name, _options, callback) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active = true;
        try { await callback(); resolve(); } catch (error) { reject(error); }
        finally { active = false; queue.shift()?.(); }
      };
      if (active) queue.push(run); else void run();
    });
  } };
  const storage = new Map();
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
    Object.defineProperty(globalThis, 'FUELFLOW_KIOSK_AUTH', { configurable: true, value: true });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'es' } });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
      getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { append() {} }, createElement: () => ({
      setAttribute() {}, addEventListener() {}, showModal() {}, close() {}, remove() {},
      querySelector: () => ({ textContent: '', remove() {} }),
    }) } });
    await reserveBrowserTab();
    let secondReady = false;
    const second = reserveBrowserTab().then(() => { secondReady = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(secondReady, false);
    releaseRecoveredTab();
    await second;
    assert.equal(secondReady, true);
    releaseRecoveredTab();
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
