import test from 'node:test';
import assert from 'node:assert/strict';
import gatewayHandler from '../api/gateway.js';
import { createGateway } from '../server/gateway.js';

test('FuelFlow exports only its signed gateway Function', () => {
  assert.equal(typeof gatewayHandler, 'function');
  assert.equal(typeof createGateway, 'function');
});
