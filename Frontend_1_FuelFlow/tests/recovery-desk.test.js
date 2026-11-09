import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryActions } from '../src/js/recoveryDesk.js';

test('recovery desk permits only pending-order cancellation or financially reconciled closure', () => {
  const pending = { status: 'ACTIVE', order: { status: 'PENDING' }, payment: { status: 'PENDING' },
    reservation: { status: 'PENDING_PAYMENT' }, authorization: null, sale: null };
  assert.deepEqual(recoveryActions(pending), { cancel: true, close: false });
  assert.deepEqual(recoveryActions({ ...pending, sale: { status: 'PAID' } }), { cancel: false, close: false });
  const cancelled = { ...pending, order: { status: 'CANCELLED' }, payment: { status: 'CANCELLED' },
    reservation: { status: 'CANCELLED' } };
  assert.deepEqual(recoveryActions(cancelled), { cancel: false, close: true });
  const settled = { ...pending, order: { status: 'CAPTURED' }, payment: { status: 'CAPTURED' },
    reservation: { status: 'CLOSED' }, authorization: { status: 'SETTLED' }, sale: { status: 'PAID' },
    receipt: { number: 'EB01-0008' } };
  assert.deepEqual(recoveryActions(settled), { cancel: false, close: true });
  assert.deepEqual(recoveryActions({ ...settled, receipt: null }), { cancel: false, close: false });
  assert.deepEqual(recoveryActions({ ...settled, status: 'CLOSED' }), { cancel: false, close: false });
});
