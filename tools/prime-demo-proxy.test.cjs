'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes, randomInt } = require('node:crypto');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { createPrimeProxy } = require('./prime-demo-proxy.cjs');

const origin = 'https://localhost';
const accessCode = () => randomBytes(16).toString('hex');
const password = () => 'Aa1!' + randomBytes(16).toString('hex');

async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

function registry(t) {
  const dir = mkdtempSync(join(tmpdir(), 'prime-proxy-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function request(base, path, { method = 'GET', body, token, headers } = {}) {
  return fetch(base + '/api/v1' + path, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    body: body && JSON.stringify(body),
  });
}

const post = (base, path, body) => request(base, path, { method: 'POST', body });

test('proxy limita rutas, origen, formato y escritura de la reserva antes del alta', async t => {
  let forwarded = 0;
  const fake = await listen(t, createServer((_req, res) => {
    forwarded++;
    res.writeHead(500).end();
  }));
  const dir = registry(t);
  const base = await listen(t, createPrimeProxy(accessCode(), fake, dir));
  const preflight = await request(base, '/auth/register', {
    method: 'OPTIONS', headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,ngrok-skip-browser-warning',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  for (const [path, method] of [
    ['/admin/login', 'POST'], ['/control/customers', 'GET'], ['/terminals', 'GET'],
    ['/plate-recognition', 'POST'], ['/auth/reset-password', 'POST'],
  ]) {
    assert.equal((await request(base, path, { method })).status, 404);
  }
  assert.equal((await request(base, '/auth/register', { method: 'POST', headers: { Origin: 'https://outside.test' } })).status, 403);
  const registration = { name: 'Prime QA', email: 'sample@example.test', password: password() };
  for (const extra of [
    { password: 'short1!' }, { password: 'Aa1!' + 'é'.repeat(35) }, { role: 'admin' },
    { dni: '12345678', passport: 'AB12345' },
  ]) {
    assert.equal((await post(base, '/auth/register', { ...registration, ...extra })).status, 400);
  }
  mkdirSync(join(dir, 'registered-accounts.json'));
  assert.equal((await post(base, '/auth/register', registration)).status, 502);
  assert.equal(forwarded, 0);
});

test('un alta incierta no autoriza una cuenta preexistente con el mismo correo', async t => {
  const email = 'existing@example.test';
  const fake = await listen(t, createServer((req, res) => {
    if (req.url.endsWith('/register')) return res.destroy();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      user: { id: 'preexisting-user', email }, accessToken: 'test.jwt.fixture', expiresIn: 3600,
    }));
  }));
  const dir = registry(t);
  const demoCode = accessCode();
  const base = await listen(t, createPrimeProxy(demoCode, fake, dir));
  const credential = password();
  const demoAlias = 'demo+' + demoCode + '@primaxprime.pe';
  assert.equal((await post(base, '/auth/register', { name: 'Prime QA', email: demoAlias, password: credential })).status, 409);
  assert.equal((await post(base, '/auth/register', { name: 'Prime QA', email, password: credential })).status, 502);
  const restarted = await listen(t, createPrimeProxy(accessCode(), fake, dir));
  assert.equal((await post(restarted, '/auth/login', { identifier: email, password: credential })).status, 401);
});

test('registro y recuperación sobre NestJS y PostgreSQL locales', {
  skip: !process.env.PRIME_TEST_POSTGRES_CONTAINER && !process.env.PRIME_TEST_UPSTREAM,
}, async t => {
  const upstream = process.env.PRIME_TEST_UPSTREAM;
  const container = process.env.PRIME_TEST_POSTGRES_CONTAINER;
  assert.match(upstream ?? '', /^http:\/\/127\.0\.0\.1:\d{1,5}$/, 'Configura el upstream aislado');
  assert.notEqual(upstream, 'http://127.0.0.1:27200', 'No usar la API de la feria');
  assert.match(container ?? '', /^primax-final[a-z0-9-]*-postgres-\d+$/, 'Usa un contenedor de PostgreSQL de un laboratorio final aislado');
  const service = execFileSync('docker', ['inspect', '--format',
    '{{ index .Config.Labels "com.docker.compose.service" }}', container], { encoding: 'utf8' }).trim();
  assert.equal(service, 'postgres');
  const dir = registry(t);
  const base = await listen(t, createPrimeProxy(accessCode(), upstream, dir));
  const prefix = 'prime-qa-' + randomBytes(12).toString('hex');
  const dni = String(randomInt(10_000_000, 100_000_000));
  const passport = randomBytes(7).toString('hex').toUpperCase();
  const ruc = String(randomInt(20_000_000_000, 30_000_000_000));
  const users = [
    { name: 'Prime Sin Documento', email: prefix + '-a@example.test', password: password() },
    { name: 'Prime DNI', email: prefix + '-b@example.test', password: password(), dni },
    { name: 'Prime Pasaporte', email: prefix + '-c@example.test', password: password(), passport, ruc, businessName: 'Negocio Prime QA' },
  ];
  const sessions = [];
  for (const [index, user] of users.slice(0, 2).entries()) {
    const fields = index === 0 ? { dni: '', passport: null, ruc: ' ', businessName: '' } : {};
    const response = await post(base, '/auth/register', { ...user, ...fields });
    assert.equal(response.status, 201);
    sessions.push(await response.json());
  }

  // Commit in the actual backend, then simulate losing that response before the proxy sees it.
  let committed;
  const droppingUpstream = await listen(t, createServer(async (req, res) => {
    try {
      const upstreamResponse = await fetch(upstream + req.url, {
        method: req.method, headers: req.headers, body: req, duplex: 'half',
      });
      if (upstreamResponse.status === 201) committed = await upstreamResponse.json();
    } finally {
      res.destroy();
    }
  }));
  const interrupted = await listen(t, createPrimeProxy(accessCode(), droppingUpstream, dir));
  assert.equal((await post(interrupted, '/auth/register', { ...users[2], passport: ' ' + passport.toLowerCase() + ' ' })).status, 502);
  assert.ok(committed?.user?.id);

  const restarted = await listen(t, createPrimeProxy(accessCode(), upstream, dir));
  const identities = [users[0].email, dni, users[2].email];
  for (const [index, user] of users.entries()) {
    const response = await post(restarted, '/auth/login', { identifier: identities[index], password: user.password });
    assert.equal(response.status, 200);
    const session = await response.json();
    assert.equal(session.user.id, (sessions[index] ?? committed).user.id);
    assert.equal(session.user.email, user.email);
    const membership = await request(restarted, '/memberships/me', { token: session.accessToken });
    assert.equal(membership.status, 200);
    const profile = await membership.json();
    assert.equal(profile.dni ?? null, user.dni ?? null);
    assert.equal(profile.passport ?? null, user.passport ?? null);
  }
  assert.equal((await post(restarted, '/auth/login', {
    identifier: users[0].email, password: users[1].password,
  })).status, 401);
  assert.equal((await post(restarted, '/auth/register', users[0])).status, 409);
  assert.equal((await post(restarted, '/auth/register', { ...users[1], email: prefix + '-dup@example.test' })).status, 409);

  // A fresh proxy cannot issue a session for an upstream account outside its allowlist.
  const unlisted = await listen(t, createPrimeProxy(accessCode(), upstream, registry(t)));
  for (const identifier of [users[1].email, dni]) {
    assert.equal((await post(unlisted, '/auth/login', { identifier, password: users[1].password })).status, 401);
  }

  const sql = `
    SELECT u.id, u.email, m.dni, m.passport, m.ruc, m."businessName",
      length(u."passwordHash") = 60 AS hashed
    FROM "User" u JOIN "Membership" m ON m."userId" = u.id
    WHERE u.email LIKE '${prefix}%' ORDER BY u.email
  `;
  const rows = JSON.parse(execFileSync('docker', [
    'exec', container,
    'sh', '-c', 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"', 'psql',
    `SELECT json_agg(q ORDER BY email) FROM (${sql}) q`,
  ], { encoding: 'utf8' }));
  assert.deepEqual(rows, users.map((user, index) => ({
    id: (sessions[index] ?? committed).user.id, email: user.email, hashed: true,
    dni: user.dni ?? null, passport: user.passport ?? null,
    ruc: user.ruc ?? null, businessName: user.businessName ?? null,
  })));
});
