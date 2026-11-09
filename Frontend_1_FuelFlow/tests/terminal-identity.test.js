import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pumpCode, terminalIdentityText } from '../src/js/terminalIdentity.js';
import { recoveryStatusLabel } from '../src/js/recoveryLabels.js';

test('terminal and pump identity come from the confirmed Backend assignment in every language', () => {
  const t01 = { code: 'PRIMAX-SUR-T01', pumpCode: '03' };
  const t02 = { code: 'PRIMAX-SUR-T02', pumpCode: '04' };
  assert.equal(terminalIdentityText(t01), 'Terminal T01 · Surtidor 03');
  assert.equal(terminalIdentityText(t02), 'Terminal T02 · Surtidor 04');
  assert.equal(terminalIdentityText(t02, 'en'), 'Terminal T02 · Pump 04');
  assert.equal(terminalIdentityText(t02, 'qu'), 'Terminal T02 · Surtidor 04');
  assert.equal(terminalIdentityText({ code: 'PRIMAX-SUR-T02', pumpCode: null }), null);
  assert.equal(pumpCode(null), '—');
  const script = readFileSync(new URL('../src/js/script.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(script + html, /(?:surtidor|pump) 03\b/i);
  for (const key of ['footer_surtidor', 'help_paso_1', 'help_m_llegada', 'modal_pago_m'])
    assert.match(script, new RegExp(`${key}: [^\n]*\\{pump\\}`));
});

test('recovery statuses have Spanish labels specific to each financial record', () => {
  assert.equal(recoveryStatusLabel('operation', 'ACTIVE'), 'Activa');
  assert.equal(recoveryStatusLabel('operation', 'CLOSED'), 'Cerrada');
  assert.equal(recoveryStatusLabel('order', 'CANCELLED'), 'Cancelada');
  assert.equal(recoveryStatusLabel('payment', 'CANCELLED'), 'Cancelado');
  assert.equal(recoveryStatusLabel('payment', 'CAPTURED'), 'Pago confirmado');
  assert.equal(recoveryStatusLabel('authorization', 'SETTLED'), 'Liquidada');
  assert.equal(recoveryStatusLabel('reservation', 'CLOSED'), 'Cerrada');
  assert.equal(recoveryStatusLabel('sale', 'PAID'), 'Pagada');
});
