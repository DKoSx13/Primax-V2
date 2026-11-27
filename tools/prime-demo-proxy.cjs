'use strict';
// Primax Prime: temporary fair-only multi-account gateway.
// Does not publish backend admin, terminal, kiosk or OCR routes.
const http = require('node:http');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const {
  closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const HOST = '127.0.0.1';
const PORT = 27285;
const UPSTREAM = 'http://127.0.0.1:27200';
const APP_ORIGIN = 'https://localhost';
const DEMO_EMAIL = 'demo@primaxprime.pe';
const BODY_LIMIT = 4096;
const RESPONSE_LIMIT = 2 * 1024 * 1024;
const LOGIN = '/api/v1/auth/login';
const REGISTER = '/api/v1/auth/register';
const RECHARGE = '/api/v1/memberships/me/recharges';
const VEHICLES = '/api/v1/vehicles';
const PROFILE = '/api/v1/memberships/me/profile';
const REDEEM = '/api/v1/rewards/redeem';
const reads = new Set(['/api/v1/benefits', '/api/v1/memberships/me', '/api/v1/memberships/me/wallet']);
const pagedReads = new Set(['transactions', 'rewards', 'redemptions'].map(name => '/api/v1/memberships/me/' + name));
const corsHeaders = new Set(['authorization', 'content-type', 'ngrok-skip-browser-warning']);
const jwtPattern = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]{1,64}@[^\s@]{1,180}\.[^\s@]{2,}$/;
const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const digest = value => createHash('sha256').update(value).digest();
const fingerprint = value => digest(value).toString('hex');
const hexKey = /^[0-9a-f]{64}$/;
const registrationFields = {
  dni: /^\d{8}$/,
  passport: /^[A-Z0-9]{5,20}$/,
  ruc: /^\d{11}$/,
  businessName: /^[^\x00-\x1f\x7f]{1,160}$/,
};
const registrationKeys = new Set(['name', 'email', 'password', ...Object.keys(registrationFields)]);

function registrationUserId(email, nonce) {
  // Same UUID derivation as AuthService for a fair registration.
  const key = fingerprint(`prime-fair-registration:${nonce}:${email}`);
  return `${key.slice(0, 8)}-${key.slice(8, 12)}-8${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
}

function accountRegistry(dir) {
  // A reservation is durable before forwarding the registration to PostgreSQL.
  // Older entries contain only the email fingerprint.
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'registered-accounts.json');
  let saved = [];
  try { saved = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const validKey = value => typeof value === 'string' && hexKey.test(value);
  if (!Array.isArray(saved) || saved.length > 100 || saved.some(item =>
    !validKey(item) && !(validKey(item?.emailHash) && validKey(item?.nonce))))
    throw Error('El listado local de cuentas de feria es inválido');
  let known = new Map(saved.map(item => typeof item === 'string'
    ? [item, null] : [item.emailHash, item.nonce]));

  function save(next) {
    const temp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
    const fd = openSync(temp, 'wx', 0o600);
    try {
      try {
        writeFileSync(fd, JSON.stringify([...next].map(([emailHash, nonce]) =>
          nonce ? { emailHash, nonce } : emailHash)));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temp, file);
    } catch (error) {
      try { unlinkSync(temp); } catch { /* The temporary file may already be gone. */ }
      throw error;
    }
    known = next;
    const directory = openSync(dir, 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }

  return {
    count: () => known.size,
    has: email => known.has(fingerprint(email)),
    allows(email, userId) {
      const nonce = known.get(fingerprint(email));
      return nonce === null || (nonce !== undefined && userId === registrationUserId(email, nonce));
    },
    reserve(email) {
      const key = fingerprint(email);
      if (known.has(key)) return { nonce: known.get(key), fresh: false };
      const nonce = randomBytes(32).toString('hex');
      save(new Map(known).set(key, nonce));
      return { nonce, fresh: true };
    },
    release(email) {
      const next = new Map(known);
      next.delete(fingerprint(email));
      save(next);
    },
  };
}

function methodFor(path, query) {
  if (pagedReads.has(path)) return /^(?:|page=(?:[1-9]\d{0,2}|1000)&limit=100)$/.test(query) ? 'GET' : null;
  if (query) return null;
  if ([LOGIN, REGISTER, RECHARGE, VEHICLES, REDEEM].includes(path)) return 'POST';
  if (path === PROFILE) return 'PATCH';
  return reads.has(path) ? 'GET' : null;
}
function limiter(limit) {
  let windowStart = 0, used = 0;
  return () => {
    const now = Date.now();
    if (now >= windowStart + 60_000) { windowStart = now; used = 0; }
    return ++used <= limit;
  };
}
function reply(response, status, body) {
  if (body !== undefined) response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.writeHead(status).end(body === undefined ? undefined : JSON.stringify(body));
}
function reject(response, status, message) {
  response.setHeader('Connection', 'close');
  reply(response, status, { message });
}
async function requestBody(request, response) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || '')) {
    reject(response, 415, 'Se requiere JSON'); return null;
  }
  if (Number(request.headers['content-length']) > BODY_LIMIT) {
    reject(response, 413, 'Petición demasiado grande'); return null;
  }
  let size = 0; const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > BODY_LIMIT) { reject(response, 413, 'Petición demasiado grande'); return null; }
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* Invalid JSON is handled below. */ }
  reject(response, 400, 'Petición inválida'); return null;
}
async function jsonResponse(upstream) {
  if (!/^application\/json(?:;|$)/i.test(upstream.headers.get('content-type') || '') || !upstream.body) {
    await upstream.body?.cancel(); throw Error('Respuesta no JSON');
  }
  const chunks = []; let size = 0;
  for await (const chunk of upstream.body) {
    size += chunk.length;
    if (size > RESPONSE_LIMIT) throw Error('Respuesta demasiado grande');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function registrationBody(input) {
  if (Object.keys(input).some(key => !registrationKeys.has(key)))
    return { error: 'El registro contiene campos no autorizados.' };
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80) return { error: 'Ingresa un nombre válido (máximo 80 caracteres).' };
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !emailPattern.test(email)) return { error: 'Ingresa un correo válido.' };
  const { password } = input;
  if (typeof password === 'string' && Buffer.byteLength(password, 'utf8') > 72)
    return { error: 'Tu contraseña es demasiado larga. Prueba con una más corta.' };
  if (typeof password !== 'string' || [...password].length < 8 || !passwordPattern.test(password))
    return { error: 'La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y carácter especial.' };

  const body = { name, email, password };
  const labels = { dni: 'DNI', passport: 'pasaporte', ruc: 'RUC', businessName: 'razón social' };
  for (const [key, regex] of Object.entries(registrationFields)) {
    const value = input[key];
    if (value == null) continue;
    if (typeof value !== 'string') return { error: `Revisa el campo ${labels[key]}.` };
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!regex.test(key === 'passport' ? trimmed.toUpperCase() : trimmed))
      return { error: `Revisa el campo ${labels[key]}.` };
    body[key] = key === 'passport' ? trimmed.toUpperCase() : trimmed;
  }
  if (body.dni && body.passport) return { error: 'Elige DNI o pasaporte.' };
  return { body };
}
function profileValid(input) {
  if (Object.keys(input).some(key => !Object.hasOwn(registrationFields, key)) || (input.dni && input.passport)) return false;
  for (const [key, regex] of Object.entries(registrationFields)) {
    const value = input[key];
    if (value !== undefined && value !== null &&
        (typeof value !== 'string' || !regex.test(key === 'passport' ? value.toUpperCase() : value))) return false;
  }
  return true;
}

function createPrimeProxy(accessCode, upstream = UPSTREAM,
  registryDir = process.env.PRIME_FAIR_REGISTRY_DIR || join(homedir(), '.primax-feria')) {
  if (!/^[0-9a-f]{32}$/.test(accessCode || '')) throw Error('Código de feria inválido');
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(upstream)) throw Error('Backend fuera de loopback');
  const demoAliasHash = digest(DEMO_EMAIL.replace('@', '+' + accessCode + '@'));
  const accounts = accountRegistry(registryDir);
  const registrationsInFlight = new Set();
  const sessions = new Map();
  const traffic = limiter(1200), logins = limiter(24), registrations = limiter(5);
  const recharges = limiter(24), vehicles = limiter(15), redemptions = limiter(15);

  const server = http.createServer({
    maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 10000, connectionsCheckingInterval: 1000,
  }, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    let registeringEmail;
    try {
      const { origin, authorization } = request.headers;
      if (origin && origin !== APP_ORIGIN) return reject(response, 403, 'Origen no autorizado');
      if (origin) response.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
      if (!traffic()) { response.setHeader('Retry-After', '60'); return reject(response, 429, 'Demasiadas solicitudes'); }
      const match = /^(\/api\/v1\/[a-z/-]+)(?:\?([^?#]+))?$/.exec(request.url || '');
      const path = match?.[1], query = match?.[2] || '';
      const allowed = methodFor(path, query);
      if (!allowed) return reject(response, 404, 'Ruta no disponible');
      if (request.method === 'OPTIONS') {
        const requested = (request.headers['access-control-request-headers'] || '').toLowerCase()
          .split(',').map(header => header.trim()).filter(Boolean);
        if (!origin || request.headers['access-control-request-method'] !== allowed ||
            requested.some(header => !corsHeaders.has(header))) return reject(response, 403, 'Preflight no autorizado');
        response.setHeader('Access-Control-Allow-Methods', allowed);
        response.setHeader('Access-Control-Allow-Headers', [...corsHeaders].join(', '));
        response.setHeader('Access-Control-Max-Age', '300');
        return reply(response, 204);
      }
      if (request.method !== allowed) { response.setHeader('Allow', allowed); return reject(response, 405, 'Método no disponible'); }

      const headers = { Accept: 'application/json' };
      if (path !== LOGIN && path !== REGISTER) {
        const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
        if (!token || token.length > 2048 || !jwtPattern.test(token)) return reject(response, 401, 'Sesión no autorizada');
        const fp = digest(token).toString('hex');
        if (!(sessions.get(fp) > Date.now())) { sessions.delete(fp); return reject(response, 401, 'Sesión no autorizada'); }
        headers.Authorization = 'Bearer ' + token;
      } else if (path === LOGIN && !logins()) {
        response.setHeader('Retry-After', '60'); return reject(response, 429, 'Demasiados intentos');
      }

      let body, expectedEmail, isDemo, reservation;
      if (allowed === 'POST' || allowed === 'PATCH') {
        const input = await requestBody(request, response);
        if (!input) return;
        headers['Content-Type'] = 'application/json';
        if (path === LOGIN) {
          if (Object.keys(input).length !== 2 || typeof input.identifier !== 'string' ||
              typeof input.password !== 'string' || !input.password ||
              Buffer.byteLength(input.password) > 72) return reject(response, 401, 'Acceso no autorizado');
          const identifier = input.identifier.trim().toLowerCase();
          isDemo = timingSafeEqual(digest(identifier), demoAliasHash);
          const byDni = registrationFields.dni.test(identifier);
          if (!isDemo && !byDni && (identifier === DEMO_EMAIL || !accounts.has(identifier)))
            return reject(response, 401, 'Acceso no autorizado');
          expectedEmail = isDemo ? DEMO_EMAIL : byDni ? undefined : identifier;
          body = { identifier: isDemo ? DEMO_EMAIL : identifier, password: input.password };
        } else if (path === REGISTER) {
          if (!registrations()) { response.setHeader('Retry-After', '60'); return reject(response, 429, 'Demasiados registros'); }
          const registration = registrationBody(input);
          if (registration.error) return reject(response, 400, registration.error);
          body = registration.body;
          expectedEmail = body.email;
          if (expectedEmail === DEMO_EMAIL || timingSafeEqual(digest(expectedEmail), demoAliasHash) ||
              registrationsInFlight.has(expectedEmail))
            return reject(response, 409, 'Intenta iniciar sesión con el correo registrado.');
          if (!accounts.has(expectedEmail) && accounts.count() >= 100)
            return reject(response, 429, 'Registro de feria completo');
          reservation = accounts.reserve(expectedEmail);
          if (!reservation.nonce) return reject(response, 409, 'Cuenta registrada; inicia sesión');
          registeringEmail = expectedEmail;
          registrationsInFlight.add(registeringEmail);
          headers['x-prime-registration-nonce'] = reservation.nonce;
        } else if (path === RECHARGE) {
          if (Object.keys(input).length !== 2 || typeof input.amount !== 'string' ||
              !/^\d{1,3}(?:\.\d{1,2})?$/.test(input.amount) || Number(input.amount) <= 0 ||
              Number(input.amount) > 100 || typeof input.operationId !== 'string' || !uuidPattern.test(input.operationId))
            return reject(response, 400, 'Recarga demo válida hasta S/ 100');
          if (!recharges()) { response.setHeader('Retry-After', '60'); return reject(response, 429, 'Demasiadas recargas'); }
          body = { amount: input.amount, operationId: input.operationId };
        } else if (path === VEHICLES) {
          if (Object.keys(input).length !== 2 || typeof input.plate !== 'string' ||
              !/^[A-Z0-9]{3}-\d{3}$/.test(input.plate.trim().toUpperCase()) ||
              typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > 80)
            return reject(response, 400, 'Datos del vehículo inválidos');
          if (!vehicles()) return reject(response, 429, 'Demasiados vehículos');
          body = { plate: input.plate.trim().toUpperCase(), label: input.label.trim() };
        } else if (path === PROFILE) {
          if (!profileValid(input)) return reject(response, 400, 'Perfil inválido');
          body = input;
        } else if (path === REDEEM) {
          if (Object.keys(input).length !== 2 || typeof input.operationId !== 'string' ||
              !uuidPattern.test(input.operationId) || typeof input.benefitId !== 'string' ||
              !uuidPattern.test(input.benefitId)) return reject(response, 400, 'Canje inválido');
          if (!redemptions()) return reject(response, 429, 'Demasiados canjes');
          body = input;
        }
      } else if (Number(request.headers['content-length']) > 0 || request.headers['transfer-encoding']) {
        return reject(response, 400, 'El método no admite un cuerpo');
      }

      const result = await fetch(upstream + path + (query ? '?' + query : ''), {
        method: allowed, headers, ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (result.status >= 500) { await result.body?.cancel(); return reject(response, 502, 'Backend no disponible'); }
      if (reservation?.fresh && result.status >= 400 && result.status < 500)
        accounts.release(registeringEmail);
      const data = await jsonResponse(result);
      if ((path === LOGIN || path === REGISTER) && result.ok) {
        const email = typeof data.user?.email === 'string' ? data.user.email.toLowerCase() : '';
        if (!email || (expectedEmail && email !== expectedEmail) || typeof data.user?.id !== 'string' ||
            typeof data.accessToken !== 'string' ||
            data.accessToken.length > 2048 || !jwtPattern.test(data.accessToken) ||
            !Number.isFinite(data.expiresIn) || data.expiresIn <= 0)
          return reject(response, 502, 'Sesión no disponible');
        if (!isDemo && (email === DEMO_EMAIL || !accounts.allows(email, data.user.id)))
          return reject(response, path === REGISTER ? 502 : 401, 'Sesión no autorizada');
        const now = Date.now();
        for (const [key, expires] of sessions) if (expires <= now) sessions.delete(key);
        const key = digest(data.accessToken).toString('hex');
        if (!sessions.has(key) && sessions.size >= 128) return reject(response, 503, 'Capacidad de sesiones alcanzada');
        sessions.set(key, now + Math.min(data.expiresIn, 3600) * 1000);
      }
      reply(response, result.status, data);
    } catch {
      if (!response.headersSent && !response.destroyed) reject(response, 502, 'Backend no disponible');
    } finally {
      if (registeringEmail) registrationsInFlight.delete(registeringEmail);
    }
  });
  server.maxConnections = 32;
  server.setTimeout(12000, socket => socket.destroy());
  return server;
}
module.exports = { createPrimeProxy };
if (require.main === module) {
  try {
    const proxy = createPrimeProxy(process.env.PRIME_PROXY_ACCESS_CODE);
    proxy.on('error', () => { console.error('No se pudo iniciar el proxy en 127.0.0.1:27285.'); process.exitCode = 1; });
    proxy.listen(PORT, HOST, () => console.log('Proxy multiusuario de feria en http://127.0.0.1:27285'));
  } catch (error) {
    console.error('No se pudo iniciar el proxy. Comprueba PRIME_PROXY_ACCESS_CODE (32 caracteres hexadecimales) y permisos del directorio privado.');
    process.exitCode = 1;
  }
}
