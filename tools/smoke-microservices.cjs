// Writes demonstration operations through public APIs. Run against an isolated stack.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const origin = n => `http://127.0.0.1:${process.env['FRONTEND' + n + '_PORT'] || (26080 + n)}`;
const api = process.env.API_ORIGIN || 'http://127.0.0.1:26000';
const cookies = new Map(); let sessionCsrf = '';
function saveCookies(r) { for (const v of r.headers.getSetCookie()) { const [k, value] = v.split(';')[0].split('='); cookies.set(k, value); } }
async function call(base, path, body, headers = {}, expected = [200,201]) {
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  saveCookies(r);
  const data = await r.json();
  assert(expected.includes(r.status), `${path}: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const cookieHeader = () => [...cookies].map(([k,v]) => `${k}=${v}`).join('; ');
function kiosk(path, body, terminal = false, expected) {
  return call(origin(1), path, body, { Origin: origin(1), 'X-FuelFlow-Request': '1',
    Cookie: cookieHeader(), 'X-CSRF-Token': terminal ? cookies.get('primax-terminal-csrf-local') : sessionCsrf }, expected);
}
async function main() {
  for (const n of [1,2,3]) {
    const r = await fetch(origin(n)); assert(r.ok, `frontend ${n}`);
    assert((await r.text()).includes('<html'), `frontend ${n} HTML`);
  }
  const health = await call(api, '/api/v1/health'); assert.equal(health.status, 'ok');
  const fuels = await call(origin(2), '/api/v1/fuels');
  const stations = await call(origin(2), '/api/v1/stations');
  const stationId = stations.find(s => s.code === 'PRIMAX-SUR').id;
  const fuel = fuels.find(f => f.code === 'REGULAR');
  const initialSession = await kiosk('/api/kiosk/terminal-bootstrap', {});
  sessionCsrf = initialSession.csrfToken;
  assert.equal(initialSession.prepared, true); // Before any Control login.
  const member = await call(origin(2), '/api/v1/auth/login', { email: 'demo@primaxprime.pe', password: process.env.DEMO_PASSWORD || 'PrimaxDemo123!' });
  const bearer = { Authorization: 'Bearer ' + member.accessToken };
  await call(origin(2), '/api/v1/memberships/me', undefined, bearer);
  await call(origin(2), '/api/v1/vehicles', undefined, bearer);
  await call(origin(2), '/api/v1/memberships/me', undefined, {}, [401]);
  await call(origin(3), '/api/v1/control/login', { email: 'control-admin@primax.local', password: process.env.DEMO_CONTROL_ADMIN_PASSWORD || 'AdminDemoLocal123!' });
  const control = { Cookie: cookieHeader() };
  const terminals = await call(origin(3), `/api/v1/control/terminals?stationId=${stationId}`, undefined, control);
  const terminal = terminals.terminals.find(t => t.code === 'PRIMAX-SUR-T01');
  await call(origin(3), `/api/v1/control/terminals/${terminal.id}/status`, { action: 'SUSPEND', reason: 'Obsolete switch' }, control, [409]);
  await call(origin(3), '/api/v1/control/customers', undefined, control);
  await call(origin(3), '/api/v1/control/inventory', undefined, control);
  const bootstrap = await kiosk('/api/kiosk/terminal-bootstrap', {});
  sessionCsrf = bootstrap.csrfToken;
  const operationId = randomUUID();
  await kiosk('/api/v1/terminal/operations', { operationId }, true);
  await call(origin(1), '/api/kiosk/terminal-bootstrap', {}, { Origin: origin(1), 'X-FuelFlow-Request': '1' }, [409]);
  const image = readFileSync(resolve(__dirname, '../PlateRecognition/fixtures/ABC-123.png')).toString('base64');
  const ocr = await kiosk('/api/v1/plate-recognition', { image });
  assert.equal(ocr.plate, 'ABC-123'); assert.equal(ocr.recognized, true);
  const authBody = { operationId, plate: 'ABC-123', amount: '21.30', fuelId: fuel.id, stationId, mode: 'PREPAGO', paymentMethod: 'TARJETA', receiptType: 'BOLETA' };
  const auth = await kiosk('/api/v1/authorizations', authBody);
  assert.equal(auth.authorization.unitPrice, '21.30');
  const id = auth.authorization.id;
  await kiosk(`/api/v1/authorizations/${id}/progress`, { amount: '21.31', gallons: '1.000' }, false, [400,409]);
  await kiosk(`/api/v1/authorizations/${id}/progress`, { amount: '21.30', gallons: '1.000' });
  const body = { ...authBody, authorizationId: id, gallons: '1.000', outcome: 'AUTO' };
  const sale = await kiosk('/api/v1/transactions', body);
  const replay = await kiosk('/api/v1/transactions', body);
  assert.equal(replay.transaction.id, sale.transaction.id); assert.equal(replay.replayed, true);
  assert.equal(sale.transaction.receiptType, 'BOLETA');
  assert.equal(sale.transaction.payment.status, 'CAPTURED');
  const { thermalReceipt } = await import(pathToFileURL(resolve(__dirname, '../Frontend_1_FuelFlow/src/js/thermalReceipt.js')));
  const receipt = thermalReceipt(sale.transaction);
  const printPath = '/api/v1/demo-print/jobs/receipt-' + receipt.id;
  const printed = await kiosk(printPath, receipt);
  assert.equal(printed.simulation, true); assert.equal(printed.physicalConfirmed, false);
  assert.equal((await kiosk(printPath, receipt)).id, printed.id);
  await kiosk(printPath, { ...receipt, total: '999.00' }, false, [409]);
  await kiosk(`/api/v1/terminal/operations/${operationId}/close`, {}, true);
  // An idle terminal can safely replace a lost browser session; old credentials stop working.
  const previousCookie = cookieHeader();
  const replacement = await call(origin(1), '/api/kiosk/terminal-bootstrap', {}, { Origin: origin(1), 'X-FuelFlow-Request': '1' });
  sessionCsrf = replacement.csrfToken;
  await call(origin(1), '/api/v1/terminal/me', undefined, { Origin: origin(1), 'X-FuelFlow-Request': '1', Cookie: previousCookie }, [401]);
  await kiosk('/api/v1/terminal/me');
  const history = await call(origin(2), '/api/v1/memberships/me/transactions', undefined, bearer);
  assert(history.some(t => t.id === sale.transaction.id));
  const adminReceipt = await call(origin(3), `/api/v1/control/receipts/${sale.transaction.id}`, undefined, control);
  assert.equal(adminReceipt.number, sale.transaction.receipt.number);
  assert.equal(receipt.number, adminReceipt.number);
  assert.equal(adminReceipt.transactionId, sale.transaction.id);
  const dashboard = await call(origin(3), '/api/v1/control/transactions', undefined, control);
  assert.equal(dashboard.find(row=>row.transactionId===sale.transaction.id).receipt.number,adminReceipt.number);
  assert.equal(history.find(row=>row.id===sale.transaction.id).receipt.number,adminReceipt.number);
  for (const domain of ['identity','catalog','commerce','administration']) {
    const spec = await call(api, `/docs/${domain}/api/docs-json`);
    assert(Object.keys(spec.paths).length > 0);
    if (domain !== 'identity') assert(!spec.paths['/api/v1/auth/login'], 'identity routes leaked into ' + domain);
  }
  console.log(JSON.stringify({ result: 'PASS', transactionId: sale.transaction.id, operationId,
    receiptNumber:sale.transaction.receipt.number, verified: ['automatic kiosk availability before Control login','3 web frontends','JWT/401','Control cookie/grants','catalog','OCR + vehicle','prepaid card simulation','amount ceiling','idempotent close/receipt','Prime history','simulated printing','4 distinct Swagger contracts'] }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
