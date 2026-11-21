'use strict';

const http = require('node:http');
const { createHash, timingSafeEqual } = require('node:crypto');

const HOST = '127.0.0.1';
const PORT = 27285;
const UPSTREAM = 'http://127.0.0.1:27200';
const APP_ORIGIN = 'https://localhost';
const DEMO_EMAIL = 'demo@primaxprime.pe';
const BODY_LIMIT = 4096;
const RESPONSE_LIMIT = 2 * 1024 * 1024;
const LOGIN = '/api/v1/auth/login';
const RECHARGE = '/api/v1/memberships/me/recharges';
const reads = new Set(['/api/v1/benefits', '/api/v1/memberships/me', '/api/v1/memberships/me/wallet']);
const pagedReads = new Set(['transactions', 'rewards', 'redemptions'].map(name => '/api/v1/memberships/me/' + name));
const corsHeaders = new Set(['authorization', 'content-type', 'ngrok-skip-browser-warning']);
const jwtPattern = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = value => createHash('sha256').update(value).digest();

function methodFor(path, query) {
  if (pagedReads.has(path)) return /^(?:|page=(?:[1-9]\d{0,2}|1000)&limit=100)$/.test(query) ? 'GET' : null;
  if (query) return null;
  if (path === LOGIN || path === RECHARGE) return 'POST';
  return reads.has(path) ? 'GET' : null;
}

function limiter(limit) {
  let windowStart = 0;
  let used = 0;
  return () => {
    const now = Date.now();
    if (now >= windowStart + 60_000) {
      windowStart = now;
      used = 0;
    }
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
    reject(response, 415, 'Se requiere JSON');
    return;
  }
  if (Number(request.headers['content-length']) > BODY_LIMIT) {
    reject(response, 413, 'Petición demasiado grande');
    return;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      reject(response, 413, 'Petición demasiado grande');
      return;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* Malformed JSON is rejected below. */ }
  reject(response, 400, 'Petición inválida');
}

async function jsonResponse(upstream) {
  if (!/^application\/json(?:;|$)/i.test(upstream.headers.get('content-type') || '') || !upstream.body) {
    await upstream.body?.cancel();
    throw Error();
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of upstream.body) {
    size += chunk.length;
    if (size > RESPONSE_LIMIT) throw Error();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createPrimeProxy(accessCode, upstream = UPSTREAM) {
  if (!/^[0-9a-f]{32}$/.test(accessCode || '')) throw Error('Código de feria inválido');
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(upstream)) throw Error('Backend fuera de loopback');
  const alias = digest(DEMO_EMAIL.replace('@', '+' + accessCode + '@'));
  const sessions = new Map();
  const traffic = limiter(240);
  const logins = limiter(12);
  const recharges = limiter(12);

  const server = http.createServer({
    maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 10000, connectionsCheckingInterval: 1000,
  }, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');

    try {
      const { origin, authorization } = request.headers;
      if (origin && origin !== APP_ORIGIN) return reject(response, 403, 'Origen no autorizado');
      if (origin) response.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
      if (!traffic()) {
        response.setHeader('Retry-After', '60');
        return reject(response, 429, 'Demasiadas solicitudes');
      }

      const match = /^(\/api\/v1\/[a-z/-]+)(?:\?([^?#]+))?$/.exec(request.url || '');
      const path = match?.[1];
      const query = match?.[2] || '';
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
      if (request.method !== allowed) {
        response.setHeader('Allow', allowed);
        return reject(response, 405, 'Método no disponible');
      }

      const headers = { Accept: 'application/json' };
      if (path !== LOGIN) {
        const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
        if (!token || token.length > 2048 || !jwtPattern.test(token)) return reject(response, 401, 'Sesión no autorizada');
        const fingerprint = digest(token).toString('hex');
        if (!(sessions.get(fingerprint) > Date.now())) {
          sessions.delete(fingerprint);
          return reject(response, 401, 'Sesión no autorizada');
        }
        headers.Authorization = 'Bearer ' + token;
      } else if (!logins()) {
        response.setHeader('Retry-After', '60');
        return reject(response, 429, 'Demasiados intentos');
      }

      let body;
      if (allowed === 'POST') {
        const input = await requestBody(request, response);
        if (!input) return;
        headers['Content-Type'] = 'application/json';
        if (path === LOGIN) {
          if (Object.keys(input).length !== 2 || typeof input.identifier !== 'string' ||
              !timingSafeEqual(digest(input.identifier.trim().toLowerCase()), alias) ||
              typeof input.password !== 'string' || !input.password || Buffer.byteLength(input.password) > 72)
            return reject(response, 401, 'Acceso de demostración no autorizado');
          body = { identifier: DEMO_EMAIL, password: input.password };
        } else {
          if (Object.keys(input).length !== 2 || typeof input.amount !== 'string' ||
              !/^\d{1,3}(?:\.\d{1,2})?$/.test(input.amount) ||
              Number(input.amount) <= 0 || Number(input.amount) > 100 ||
              typeof input.operationId !== 'string' || !uuidPattern.test(input.operationId))
            return reject(response, 400, 'Recarga demo válida hasta S/ 100. Usa un monto positivo');
          if (!recharges()) {
            response.setHeader('Retry-After', '60');
            return reject(response, 429, 'Demasiadas recargas');
          }
          body = { amount: input.amount, operationId: input.operationId };
        }
      } else if (Number(request.headers['content-length']) > 0 || request.headers['transfer-encoding']) {
        return reject(response, 400, 'El método no admite un cuerpo');
      }

      const result = await fetch(upstream + path + (query ? '?' + query : ''), {
        method: allowed, headers, ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (result.status >= 500) {
        await result.body?.cancel();
        return reject(response, 502, 'Backend no disponible');
      }
      const data = await jsonResponse(result);
      if (path === LOGIN && result.ok) {
        if (data.user?.email !== DEMO_EMAIL || typeof data.accessToken !== 'string' ||
            data.accessToken.length > 2048 || !jwtPattern.test(data.accessToken) ||
            !Number.isFinite(data.expiresIn) || data.expiresIn <= 0)
          return reject(response, 502, 'Sesión demo no disponible');
        const now = Date.now();
        for (const [key, expires] of sessions) if (expires <= now) sessions.delete(key);
        const key = digest(data.accessToken).toString('hex');
        if (!sessions.has(key) && sessions.size >= 128) return reject(response, 503, 'Capacidad de sesiones alcanzada');
        sessions.set(key, now + Math.min(data.expiresIn, 3600) * 1000);
      }
      reply(response, result.status, data);
    } catch {
      if (!response.headersSent && !response.destroyed) reject(response, 502, 'Backend no disponible');
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
    proxy.on('error', () => {
      console.error('No se pudo iniciar el proxy en 127.0.0.1:27285.');
      process.exitCode = 1;
    });
    proxy.listen(PORT, HOST, () => console.log('Proxy demo Prime en http://127.0.0.1:27285'));
  } catch {
    console.error('Configura PRIME_PROXY_ACCESS_CODE con 32 caracteres hexadecimales aleatorios.');
    process.exitCode = 1;
  }
}
