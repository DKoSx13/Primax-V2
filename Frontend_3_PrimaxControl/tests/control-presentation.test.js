import test from 'node:test';
import assert from 'node:assert/strict';
import { administrativeAccountForm, fuelSummaryMarkup } from '../js/control-presentation.js';
import { renderDateInputs } from '../js/date-input.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

test('direct administrative account form is global only and keeps internal role and permission values', () => {
  const session = { global: true, stations: [{ id: 'station-a', name: 'Primax Sur', code: 'SUR' }], permissions: ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_INCIDENT_VIEW'] };
  assert.equal(administrativeAccountForm({ ...session, global: false }, esc), '');
  const html = administrativeAccountForm(session, esc);
  assert.match(html, /Crear cuenta administrativa/);
  assert.match(html, /value="ADMIN">Administrador/);
  assert.match(html, /value="ENCARGADO">Encargado/);
  assert.doesNotMatch(html, /value="SUPER_ADMIN"/);
  assert.match(html, /value="ADMIN_CONTROL_ACCESS" checked required/);
  assert.match(html, /value="ADMIN_DASHBOARD_VIEW" checked required/);
  assert.match(html, /value="station-a"/);
});

test('dashboard fuel summary uses responsive cards with all inventory facts and no table', () => {
  const html = fuelSummaryMarkup({ stations: [{ id: 'a', name: 'Primax Sur' }], inventory: [{ stationId: 'a', fuel: { name: 'Premium' }, availableLiters: 5000, reservedLiters: 0, activation: { status: 'REVIEW' } }] }, { esc, fmt: (value) => String(value), statusLabel: () => 'En revisión' });
  assert.match(html, /fuel-summary-grid/);
  assert.match(html, /Premium/);
  assert.match(html, /Primax Sur/);
  assert.match(html, /Disponible<\/dt><dd>5000 L/);
  assert.match(html, /Reservado<\/dt><dd>0 L/);
  assert.match(html, /En revisión/);
  assert.doesNotMatch(html, /<table/);
});

test('date fields keep the visible format inside inputs without redundant help text', () => {
  const html = renderDateInputs({ from: '2026-11-05', to: '' }, esc);
  assert.match(html, /value="05\/11\/2026"/);
  assert.match(html, /placeholder="dd\/mm\/aaaa"/);
  assert.doesNotMatch(html, /Formato:/);
  assert.doesNotMatch(html, /type="date"/);
});
