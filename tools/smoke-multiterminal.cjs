// Creates two academic demo sales; run only against primax-feria-check.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

if (process.env.COMPOSE_PROJECT_NAME !== 'primax-feria-check')
  throw Error('This smoke is restricted to primax-feria-check');
const ports = { t01: 27181, t02: 27184, prime: 27182, control: 27183 };
const origin = (port) => `http://127.0.0.1:${port}`;
const stationCode = 'PRIMAX-SUR';

class Client {
  constructor(port, terminal = false) { this.port = port; this.terminal = terminal; this.cookies = new Map(); this.csrf = ''; }
  async call(path, body, expected = [200, 201], extra = {}) {
    const headers = { ...extra };
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    if (this.terminal) {
      headers.Origin = origin(this.port);
      headers['X-FuelFlow-Request'] = '1';
      headers['X-CSRF-Token'] = path.startsWith('/api/v1/terminal/') && body !== undefined
        ? this.cookies.get(`primax-terminal-csrf-local-${this.port}`) || '' : this.csrf;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin(this.port) + path, {
      method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
    });
    for (const item of response.headers.getSetCookie()) {
      const [name, value] = item.split(';', 1)[0].split('=');
      this.cookies.set(name, value);
    }
    const value = await response.json().catch(() => null);
    assert(expected.includes(response.status), `${this.port} ${path}: ${response.status} ${JSON.stringify(value)}`);
    return value;
  }
  async bootstrap() {
    const response = await this.call('/api/kiosk/terminal-bootstrap', {});
    assert.equal(response.prepared, true);
    this.csrf = response.csrfToken;
    return response;
  }
}

async function main() {
  const t01 = new Client(ports.t01, true), t02 = new Client(ports.t02, true);
  const prime = new Client(ports.prime), control = new Client(ports.control);
  const [stations, fuels] = await Promise.all([prime.call('/api/v1/stations'), prime.call('/api/v1/fuels')]);
  const stationId = stations.find((item) => item.code === stationCode)?.id;
  const fuelId = fuels.find((item) => item.code === 'REGULAR')?.id;
  assert(stationId && fuelId, 'Station and fuel must exist');

  const first = await prime.call('/api/v1/auth/login', { email: 'demo@primaxprime.pe', password: process.env.DEMO_PASSWORD || 'PrimaxDemo123!' });
  const firstToken = first.accessToken;
  const account = { email: 'feria-t02@example.test', password: 'FeriaT02Demo123!' };
  let second;
  const registration = await fetch(origin(ports.prime) + '/api/v1/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Cliente Feria T02', ...account }), signal: AbortSignal.timeout(30000),
  });
  if (registration.status === 201) second = await registration.json();
  else {
    assert.equal(registration.status, 409, `Register T02: ${registration.status} ${await registration.text()}`);
    second = await prime.call('/api/v1/auth/login', account);
  }
  const secondToken = second.accessToken;
  await prime.call('/api/v1/vehicles', { plate: 'GHI-789', label: 'Auto feria T02' }, [201, 200], { Authorization: `Bearer ${secondToken}` });
  const [session01, session02] = await Promise.all([t01.bootstrap(), t02.bootstrap()]);
  assert.notEqual(session01.terminalId, session02.terminalId);
  const [operation01, operation02] = [randomUUID(), randomUUID()];
  const opened = await Promise.all([
    t01.call('/api/v1/terminal/operations', { operationId: operation01 }),
    t02.call('/api/v1/terminal/operations', { operationId: operation02 }),
  ]);
  assert.equal(opened[0].operationId, operation01);
  assert.equal(opened[1].operationId, operation02);
  // An idempotent retry must keep the same persisted operation number.
  await t01.call('/api/v1/terminal/operations', { operationId: operation01 });
  const makeBody = (operationId, plate) => ({ operationId, plate, stationId, fuelId, amount: '21.30', mode: 'PREPAGO', paymentMethod: 'TARJETA', receiptType: 'BOLETA' });
  const bodies = [makeBody(operation01, 'ABC-123'), makeBody(operation02, 'GHI-789')];
  const authorizations = await Promise.all([t01.call('/api/v1/authorizations', bodies[0]), t02.call('/api/v1/authorizations', bodies[1])]);
  await Promise.all(authorizations.map((item, index) => [t01, t02][index].call(`/api/v1/authorizations/${item.authorization.id}/progress`, { amount: '21.30', gallons: '1.000' })));
  const saleBodies = bodies.map((body, index) => ({ ...body, authorizationId: authorizations[index].authorization.id, gallons: '1.000', outcome: 'AUTO' }));
  const sales = await Promise.all([t01.call('/api/v1/transactions', saleBodies[0]), t02.call('/api/v1/transactions', saleBodies[1])]);
  const replay = await t01.call('/api/v1/transactions', saleBodies[0]);
  assert.equal(replay.transaction.id, sales[0].transaction.id);
  await Promise.all([t01.call(`/api/v1/terminal/operations/${operation01}/close`, {}), t02.call(`/api/v1/terminal/operations/${operation02}/close`, {})]);
  const controlSession = await control.call('/api/v1/control/login', { email: 'control-admin@primax.local', password: process.env.DEMO_CONTROL_ADMIN_PASSWORD || 'AdminDemoLocal123!' });
  assert(controlSession);
  const visible = await control.call(`/api/v1/control/operations?stationId=${stationId}`);
  const own = [operation01, operation02].map((id) => visible.find((item) => item.operationId === id));
  assert(own.every(Boolean), 'Control must see both sales');
  assert(own.every((item) => /^OP01-\d{4,}$/.test(item.number)) && own[0].number !== own[1].number);
  assert.deepEqual(own.map((item) => item.pump.code), ['03', '04']);
  assert(own.every((item) => /^EB01-\d{4,}$/.test(item.receipt.number)));
  const history01 = await prime.call('/api/v1/memberships/me/transactions', undefined, [200], { Authorization: `Bearer ${firstToken}` });
  const history02 = await prime.call('/api/v1/memberships/me/transactions', undefined, [200], { Authorization: `Bearer ${secondToken}` });
  assert(history01.some((item) => item.id === sales[0].transaction.id) && !history01.some((item) => item.id === sales[1].transaction.id));
  assert(history02.some((item) => item.id === sales[1].transaction.id) && !history02.some((item) => item.id === sales[0].transaction.id));
  console.log(JSON.stringify({ result: 'PASS', operations: own.map((item) => ({ number: item.number, terminal: item.terminal.code, pump: item.pump.code, receipt: item.receipt.number })), checks: ['two concurrent sales', 'idempotent start and sale', 'central Control', 'isolated Prime histories'] }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
