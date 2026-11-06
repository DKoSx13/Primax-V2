import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogService } from '../src/js/apiClient.js';

test('invalid or empty plate never starts a vehicle request', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw Error('Unexpected network request'); };
  try {
    for (const plate of ['', 'ABC', 'ABC-12', undefined]) {
      await assert.rejects(catalogService.vehicle(plate), /placa válida/);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
