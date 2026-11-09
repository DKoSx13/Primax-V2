import test from 'node:test';
import assert from 'node:assert/strict';
import { digitalReceiptMarkup } from '../js/receipt-view.js';
import { movements } from '../js/views.js';
import { initialState, write } from '../js/services/store.js';

const consumption = {
  id: 'tx-1', type: 'consumo', amount: 25, points: 2,
  date: '2026-11-08T12:00:00.000Z', station: 'Primax Sur', vehicle: 'ABC-123',
  receipt: { id: 'receipt-1', number: 'EB01-0007', documentType: 'BOLETA', issuedAt: '2026-11-08T12:00:00.000Z' },
};

test('Prime reveals the stored academic receipt and keeps its number', () => {
  write({ ...initialState(), transactions: [consumption] });
  const list = movements('consumo');
  assert.match(list, /EcoDigital/);
  assert.match(list, /EB01-0007/);
  assert.match(list, /Ver comprobante digital/);
  const detail = digitalReceiptMarkup(consumption);
  assert.match(detail, /EB01-0007/);
  assert.match(detail, /sin validez tributaria/);
  assert.match(detail, /Primax Sur/);
});

test('Prime does not invent a receipt for an older consumption without one', () => {
  write({ ...initialState(), transactions: [{ ...consumption, receipt: null }] });
  const list = movements('consumo');
  assert.doesNotMatch(list, /EcoDigital|Ver comprobante digital/);
  assert.match(digitalReceiptMarkup({ ...consumption, receipt: null }), /no disponible/);
});

test('receipt metadata is escaped before entering the digital detail', () => {
  const detail = digitalReceiptMarkup({ ...consumption, receipt: { ...consumption.receipt, number: '<script>' } });
  assert.doesNotMatch(detail, /<script>/);
  assert.match(detail, /&lt;script&gt;/);
});
