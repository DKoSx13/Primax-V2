// Optional verification tool. Application startup itself needs only Docker Compose.
// Uses only the new original synthetic project; private tokens remain under .cache.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
process.chdir(repo);
const folder = '.cache/astra-lot4-compose', privateFile = folder + '/journey-private.json';
const config = JSON.parse(execFileSync('docker', ['compose', 'config', '--format', 'json'], { encoding: 'utf8' }));
assert.equal(config.name, 'primax-astra-original');
const env = config.services['identity-service'].environment;
const port = service => config.services[service].ports[0].published;
const origin = service => 'http://127.0.0.1:' + port(service);
const state = fs.existsSync(privateFile) ? JSON.parse(fs.readFileSync(privateFile)) : { operationId: randomUUID(), owner1: randomUUID(), owner2: randomUUID(), jars: {} };
const save = () => fs.writeFileSync(privateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
save();
const results = [];
async function call(service, route, method = 'GET', body, options = {}) {
  const jar = state.jars[service] ||= {};
  const isFuelFlow = ['frontend1', 'fuelflow-t02'].includes(service);
  const technical = /^\/api\/v1\/terminal\//.test(route);
  const cookieCsrf = Object.entries(jar).find(([k]) => k.startsWith('primax-terminal-csrf-local'))?.[1];
  const headers = { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(Object.keys(jar).length ? { Cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ') } : {}), ...(options.headers || {}) };
  if (isFuelFlow) Object.assign(headers, { 'x-fuelflow-request': '1', Origin: origin(service), 'sec-fetch-site': 'same-origin', 'x-fuelflow-tab': service === 'frontend1' ? state.owner1 : state.owner2, 'x-csrf-token': technical ? cookieCsrf || '' : state[service + '-csrf'] || '' });
  const response = await fetch(origin(service) + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  for (const cookie of response.headers.getSetCookie()) { const [entry] = cookie.split(';'), index = entry.indexOf('='); jar[entry.slice(0, index)] = entry.slice(index + 1); }
  const type = response.headers.get('content-type') || '';
  const value = type.includes('application/json') ? await response.json() : await response.text();
  save();
  const expected = options.status || [200, 201];
  results.push({ service, method, route, status: response.status, upstream: response.headers.get('x-service-name') });
  assert(expected.includes(response.status), method + ' ' + route + ': ' + response.status + ' ' + JSON.stringify(value));
  if (options.upstream) assert.equal(response.headers.get('x-service-name'), options.upstream);
  return value;
}
async function main() {
  // A completed synthetic purchase must never be reopened just to rerun a check.
  if (fs.existsSync(folder + '/journey-results.json')) {
    const previous = JSON.parse(fs.readFileSync(folder + '/journey-results.json'));
    const health = await call('backend', '/api/v1/health');
    assert.equal(health.status, 'ok');
    await call('frontend3', '/api/v1/control/login', 'POST', { email: env.DEMO_CONTROL_ADMIN_EMAIL, password: env.DEMO_CONTROL_ADMIN_PASSWORD });
    const receipt = await call('frontend3', '/api/v1/control/receipts/' + previous.transactionId);
    assert.equal(receipt.id, previous.receiptId); assert.equal(receipt.number, previous.receiptNumber);
    const print = await call('frontend3', '/api/v1/demo-print/jobs/receipt-' + receipt.id);
    assert.equal(print.simulation, true); assert.equal(print.physicalConfirmed, false);
    const recheck = { passed: true, completedPurchaseReused: true, financialWrites: 0, requests: results };
    fs.writeFileSync(folder + '/journey-recheck-results.json', JSON.stringify(recheck, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, completedPurchaseReused: true, requests: results.length, financialWrites: 0 }));
    return;
  }
  for (const service of ['frontend1', 'fuelflow-t02', 'frontend2', 'frontend3']) {
    assert.match(await call(service, '/'), /<html/i);
  }
  const health = await call('backend', '/api/v1/health');
  assert.equal(health.status, 'ok'); assert(Object.values(health.services).every(s => s === 'up'));
  const stations = await call('frontend2', '/api/v1/stations', 'GET', undefined, { upstream: 'catalog-service' });
  const fuels = await call('frontend2', '/api/v1/fuels', 'GET', undefined, { upstream: 'catalog-service' });
  state.station = stations.find(s => s.code === 'PRIMAX-SUR'); state.fuel = fuels.find(f => f.code === 'REGULAR'); save();
  const prime = await call('frontend2', '/api/v1/auth/login', 'POST', { email: 'demo@primaxprime.pe', password: env.DEMO_PASSWORD }, { upstream: 'identity-service' });
  await call('frontend2', '/api/v1/memberships/me', 'GET', undefined, { headers: { Authorization: 'Bearer ' + prime.accessToken }, upstream: 'identity-service' });
  await call('frontend2', '/api/v1/control/dashboard', 'GET', undefined, { headers: { Authorization: 'Bearer ' + prime.accessToken }, status: [403] });
  await call('frontend3', '/api/v1/control/login', 'POST', { email: env.DEMO_CONTROL_ADMIN_EMAIL, password: env.DEMO_CONTROL_ADMIN_PASSWORD }, { upstream: 'administration-service' });
  await call('frontend3', '/api/v1/control/dashboard', 'GET', undefined, { upstream: 'administration-service' });
  await call('frontend3', '/api/v1/control/catalog/inventory', 'GET', undefined, { upstream: 'catalog-service' });
  for (const service of ['frontend1', 'fuelflow-t02']) {
    if (!state[service + '-prepared']) {
      const bootstrap = await call(service, '/api/kiosk/terminal-bootstrap', 'POST', {});
      state[service + '-csrf'] = bootstrap.csrfToken; state[service + '-prepared'] = true; save();
    }
    await call(service, '/api/v1/terminal/claim', 'POST', {});
    const me = await call(service, '/api/v1/terminal/me');
    assert.equal(me.code, service === 'frontend1' ? 'PRIMAX-SUR-T01' : 'PRIMAX-SUR-T02');
  }
  const image = fs.readFileSync('PlateRecognition/fixtures/ABC-123.png').toString('base64');
  const ocr = await call('fuelflow-t02', '/api/v1/plate-recognition', 'POST', { image });
  assert.equal(ocr.plate, 'ABC-123'); assert.equal(ocr.recognized, true);
  if (!state.opened) { await call('fuelflow-t02', '/api/v1/terminal/operations', 'POST', { operationId: state.operationId }); state.opened = true; save(); }
  const authorization = { operationId: state.operationId, stationId: state.station.id, fuelId: state.fuel.id, plate: 'XYZ-999', amount: '21.30', unitPrice: '21.30', mode: 'PREPAGO', paymentMethod: 'YAPE', receiptType: 'BOLETA' };
  if (!state.order) { state.order = await call('fuelflow-t02', '/api/v1/online-orders', 'POST', { operationId: state.operationId, method: 'YAPE', authorization }); save(); }
  if (!state.confirmed) { await call('fuelflow-t02', '/api/v1/online-orders/' + state.order.id + '/demo-confirm', 'POST', { amount: '21.30', currency: 'PEN' }); state.confirmed = true; save(); }
  if (!state.authorization) { state.authorization = await call('fuelflow-t02', '/api/v1/authorizations', 'POST', authorization); save(); }
  if (!state.progressed) { await call('fuelflow-t02', '/api/v1/authorizations/' + state.authorization.authorization.id + '/progress', 'POST', { amount: '21.30', gallons: '1.000' }); state.progressed = true; save(); }
  const saleInput = { ...authorization, authorizationId: state.authorization.authorization.id, gallons: '1.000', outcome: 'AUTO' };
  if (!state.sale) { state.sale = await call('fuelflow-t02', '/api/v1/transactions', 'POST', saleInput); save(); }
  const saleReplay = await call('fuelflow-t02', '/api/v1/transactions', 'POST', saleInput);
  assert.equal(saleReplay.transaction.id, state.sale.transaction.id); assert.equal(saleReplay.replayed, true);
  await call('fuelflow-t02', '/api/v1/terminal/operations/' + state.operationId + '/close', 'POST', {});
  const transaction = await call('frontend3', '/api/v1/control/transactions/' + state.sale.transaction.id, 'GET', undefined, { upstream: 'administration-service' });
  assert.equal(transaction.operationId, state.operationId);
  const receipt = await call('frontend3', '/api/v1/control/receipts/' + state.sale.transaction.id);
  assert.equal(receipt.demo, true); assert.equal(receipt.total, '21.30'); assert.equal(receipt.pump, '04');
  const jobPath = '/api/v1/demo-print/jobs/receipt-' + receipt.id;
  const print = await call('fuelflow-t02', jobPath, 'POST', receipt);
  assert.equal(print.simulation, true); assert.equal(print.physicalConfirmed, false);
  assert.deepEqual(await call('fuelflow-t02', jobPath, 'POST', receipt), print);
  assert.deepEqual(await call('frontend3', jobPath), print);
  state.printPath = jobPath; state.receipt = receipt; save();
  const report = { passed: true, requests: results, operationId: state.operationId, transactionId: state.sale.transaction.id, receiptId: receipt.id, receiptNumber: receipt.number, stationId: state.station.id, amount: receipt.total, method: 'YAPE', provider: 'DEMO', terminal: 'PRIMAX-SUR-T02', ocr: { plate: ocr.plate, recognized: ocr.recognized }, print, t01RecoveryAttempted: false, externalPayments: false };
  fs.writeFileSync(folder + '/journey-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, requests: results.length, terminal: report.terminal, ocr: report.ocr, printSimulation: print.simulation, receipt: receipt.number }));
}
main().catch(error => { fs.writeFileSync(folder + '/journey-error.log', error.stack); console.error(error.message); process.exitCode = 1; });
