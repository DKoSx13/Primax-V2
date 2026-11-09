import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { kioskRoute } from './policy.js';

const LOCAL_COOKIE = 'primax-kiosk-local';
const COOKIE = '__Host-primax-kiosk';
const TERMINAL_COOKIE = '__Host-primax-terminal';
const TERMINAL_CSRF = '__Host-primax-terminal-csrf';
const sessionPath = '/api/v1/kiosk/session';
class GatewayError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new GatewayError(status, message); }
function originOnly(value, local = false, backend = false) {
  let url; try { url = new URL(value); } catch { fail(503, 'Configuración de terminal pendiente'); }
  const localOrigin = local && url.protocol === 'http:' && (backend ? url.hostname === 'backend' : ['127.0.0.1', 'localhost'].includes(url.hostname));
  if (url.protocol !== 'https:' && !localOrigin || url.origin !== value || url.username || url.password) fail(503, 'Configuración de terminal pendiente');
  return value;
}
function cookieToken(value = '', name = COOKIE) {
  const cookies = value.split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  if (cookies.length > 1) fail(400, 'Cookie inválida');
  const token = cookies[0]?.slice(name.length + 1) || '';
  if (token && !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, 'Sesión inválida');
  return token;
}
function terminalCookies(value = '', names) {
  const entries = value.split(';').map(v => v.trim());
  function one(name, pattern) {
    const found = entries.filter(v => v.startsWith(name + '='));
    if (found.length > 1) fail(400, 'Cookie inválida');
    const token = found[0]?.slice(name.length + 1) || '';
    if (token && !pattern.test(token)) fail(401, 'Sesión técnica inválida');
    return token;
  }
  return { technical: one(names.technical, /^[a-f0-9]{64}$/), terminalCsrf: one(names.csrf, /^[A-Za-z0-9_-]{43}$/) };
}
function cookieNames(env, local) {
  const scope = env.FUELFLOW_COOKIE_SCOPE || '';
  if (scope && !/^[0-9]{2,5}$/.test(scope)) fail(503, 'Configuración de terminal pendiente');
  const suffix = scope ? `-${scope}` : '';
  return {
    session: (local ? LOCAL_COOKIE : COOKIE) + suffix,
    technical: (local ? 'primax-terminal-local' : TERMINAL_COOKIE) + suffix,
    csrf: (local ? 'primax-terminal-csrf-local' : TERMINAL_CSRF) + suffix,
  };
}
function equal(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function readBody(req) {
  if (req.method === 'GET') return null;
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) fail(415, 'Se requiere JSON');
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 3000000) fail(413, 'Solicitud demasiado grande'); chunks.push(chunk); }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { fail(400, 'JSON inválido'); } }
  if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, 'JSON inválido');
  if (Buffer.byteLength(JSON.stringify(body)) > 3000000) fail(413, 'Solicitud demasiado grande');
  return body;
}

export function createGateway({ env = process.env, fetcher = globalThis.fetch } = {}) {
  return async function gateway(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const local = env.FUELFLOW_LOCAL_HTTP === 'true';
      const publicOrigin = originOnly(env.FUELFLOW_PUBLIC_ORIGIN, local);
      const backend = originOnly(env.BACKEND_ORIGIN, local, true);
      if (!env.KIOSK_GATEWAY_SECRET || env.KIOSK_GATEWAY_SECRET.length < 32 || env.KIOSK_GATEWAY_SECRET.includes('REPLACE_')) fail(503, 'Configuración de terminal pendiente');
      if (req.headers['x-fuelflow-request'] !== '1' || req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') fail(403, 'Origen no autorizado');
      const allowedOrigin = value => {
        if (value === publicOrigin) return true;
        if (!local || typeof value !== 'string') return false;
        try {
          const candidate = new URL(value), configured = new URL(publicOrigin);
          return candidate.origin === value && candidate.protocol === 'http:' &&
            ['127.0.0.1','localhost'].includes(candidate.hostname) && candidate.port === configured.port;
        } catch { return false; }
      };
      if (req.headers.origin && !allowedOrigin(req.headers.origin) || req.method !== 'GET' && !allowedOrigin(req.headers.origin)) fail(403, 'Origen no autorizado');
      const url = new URL(req.url, publicOrigin);
      // No client-controlled destination, headers, cookies or query forwarding.
      const dynamicOperation = url.pathname.match(/^\/api\/v1\/terminal\/operations\/([0-9a-fA-F-]{36})(?:\/(?:close|recovery-state))?$/);
      const dynamicBusiness = url.pathname.match(/^\/api\/v1\/(?:authorizations|online-orders|transactions)\/([0-9a-fA-F-]{36})(?:\/(?:progress|release|intervention|demo-confirm|cancel|reselect))?$/);
      const dynamicVehicle = url.pathname.match(/^\/api\/v1\/vehicles\/([A-Z0-9]{3}-[0-9]{3})$/);
      const routeId = dynamicOperation?.[1] || dynamicBusiness?.[1] || dynamicVehicle?.[1];
      const routeParam = dynamicVehicle ? 'plate' : 'id';
      const frameworkValues = url.searchParams.getAll(routeParam);
      if ((!routeId && url.search) || (routeId && (frameworkValues.length > 1 || [...url.searchParams.keys()].some(key => key !== routeParam) || (frameworkValues.length && frameworkValues[0] !== routeId))) || !['GET', 'POST'].includes(req.method)) fail(403, 'Operación no permitida');
      const names = cookieNames(env, local);
      const cookieName = names.session;
      const cookieAttributes = `Path=/; HttpOnly; ${local ? '' : 'Secure; '}SameSite=Strict`;
      const token = cookieToken(req.headers.cookie, cookieName);
      const { technical, terminalCsrf } = terminalCookies(req.headers.cookie, names);
      const owner = req.headers['x-fuelflow-tab'] || '';
      if (typeof owner !== 'string' || owner && !/^[0-9a-fA-F-]{36}$/.test(owner)) fail(400, 'Identidad de pestaña inválida');
      const csrf = req.headers['x-csrf-token'] || '';
      if (typeof csrf !== 'string' || csrf.length > 100) fail(403, 'CSRF inválido');
      const body = await readBody(req);
      if (/^\/api\/v1\/demo-print\/jobs\/receipt-[a-zA-Z0-9-]{1,100}$/.test(url.pathname) && local) {
        const response = await fetcher(backend + url.pathname, {
          method: req.method, headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
        });
        res.statusCode = response.status;
        res.end(await response.text());
        return;
      }
      async function call(method, path, payload = null, { terminal = '', authorization = '' } = {}) {
        const timestamp = String(Date.now());
        const message = JSON.stringify([method, path, timestamp, payload, token, csrf, terminal, authorization, owner]);
        const signature = createHmac('sha256', env.KIOSK_GATEWAY_SECRET).update(message).digest('hex');
        let response;
        try {
          response = await fetcher(backend + path, { method, redirect: 'error', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', 'x-kiosk-time': timestamp, 'x-kiosk-signature': signature, 'x-kiosk-session': token, 'x-csrf-token': csrf, 'x-terminal-session': terminal, authorization, 'x-terminal-owner': owner },
            ...(method !== 'GET' ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(18000),
          });
        } catch { fail(503, 'Servicio temporalmente no disponible'); }
        const value = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof value?.message === 'string' || Array.isArray(value?.message) ? value.message : 'Operación rechazada';
          throw new GatewayError(response.status, Array.isArray(message) ? message.join('. ') : message);
        }
        if (!value || typeof value !== 'object') fail(502, 'Respuesta inválida');
        return { value, status: response.status };
      }
      const sessions = {
        'GET /api/kiosk/session': ['GET', sessionPath],
        'POST /api/kiosk/session/login': ['POST', sessionPath + '/login'],
        'POST /api/kiosk/session/logout': ['POST', sessionPath + '/logout'],
      };
      const sessionRoute = sessions[req.method + ' ' + url.pathname];
      if (req.method === 'POST' && url.pathname === '/api/kiosk/terminal-recovery') {
        if (!owner || !body || Object.keys(body).length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(body.ticket || '')) fail(400, 'Recuperación inválida');
        const terminalCode = env.FUELFLOW_TERMINAL_CODE;
        if (!terminalCode || !/^[A-Z0-9-]{3,30}$/.test(terminalCode)) fail(503, 'Terminal no configurada');
        const { value } = await call('POST', sessionPath + '/terminal-recovery', { ticket: body.ticket, terminalCode });
        if (!/^[A-Za-z0-9_-]{43}$/.test(value.token || '') || !/^[A-Za-z0-9_-]{43}$/.test(value.csrfToken || '') ||
            !/^[a-f0-9]{64}$/.test(value.terminalToken || '') || !/^[0-9a-fA-F-]{36}$/.test(value.operationId || '') ||
            value.authenticated !== true) fail(502, 'Respuesta inválida');
        res.setHeader('Set-Cookie', [
          `${names.session}=${value.token}; ${cookieAttributes}; Max-Age=${value.ttl}`,
          `${names.technical}=${value.terminalToken}; Path=/; HttpOnly; ${local ? '' : 'Secure; '}SameSite=Strict; Max-Age=900`,
          `${names.csrf}=${randomBytes(32).toString('base64url')}; Path=/; ${local ? '' : 'Secure; '}SameSite=Strict; Max-Age=900`,
        ]);
        res.statusCode = 200;
        res.end(JSON.stringify({ authenticated: true, operationId: value.operationId, evidence: value.evidence,
          csrfToken: value.csrfToken, expiresAt: value.terminalExpiresAt }));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/kiosk/terminal-bootstrap') {
        if (Object.keys(body).length) fail(400, 'Solicitud inválida');
        const terminalId = env.FUELFLOW_TERMINAL_ID;
        if (terminalId && !/^[0-9a-fA-F-]{36}$/.test(terminalId)) fail(503, 'Configuración de terminal pendiente');
        const terminalCode = env.FUELFLOW_TERMINAL_CODE;
        if (terminalCode && !/^[A-Z0-9-]{3,30}$/.test(terminalCode)) fail(503, 'Configuración de terminal pendiente');
        const { value } = await call('POST', sessionPath + '/terminal-bootstrap', { ...(terminalId ? { terminalId } : {}), ...(terminalCode ? { terminalCode } : {}) }, { terminal: technical });
        if (!/^[A-Za-z0-9_-]{43}$/.test(value.token || '') || !/^[A-Za-z0-9_-]{43}$/.test(value.csrfToken || '') ||
            !/^[a-f0-9]{64}$/.test(value.terminalToken || '') || !/^[0-9a-fA-F-]{36}$/.test(value.terminalId || '') ||
            value.authenticated !== true || !Number.isInteger(value.ttl) || value.ttl < 1 || value.ttl > 1800) fail(502, 'Respuesta inválida');
        const technicalName = names.technical;
        const csrfName = names.csrf;
        const secure = local ? '' : 'Secure; ';
        res.setHeader('Set-Cookie', [
          `${cookieName}=${value.token}; ${cookieAttributes}; Max-Age=${value.ttl}`,
          `${technicalName}=${value.terminalToken}; Path=/; HttpOnly; ${secure}SameSite=Strict; Max-Age=28800`,
          `${csrfName}=${randomBytes(32).toString('base64url')}; Path=/; ${secure}SameSite=Strict; Max-Age=28800`,
        ]);
        res.statusCode = 200;
        res.end(JSON.stringify({ authenticated: true, csrfToken: value.csrfToken, expiresAt: value.expiresAt, stationId: value.stationId, terminalId: value.terminalId, prepared: true }));
        return;
      }
      if (sessionRoute) {
        if (req.method === 'POST' && (!token || !csrf)) fail(403, 'Sesión y CSRF requeridos');
        if (url.pathname.endsWith('/login') && (Object.keys(body).some(k => !['username', 'password'].includes(k)) || typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 80 || Buffer.byteLength(body.password) > 72)) fail(400, 'Credenciales inválidas');
        const { value, status } = await call(...sessionRoute, body);
        const { token: replacement, ttl } = value;
        const safe = { authenticated: value.authenticated === true, csrfToken: value.csrfToken, expiresAt: value.expiresAt,
          ...(value.recoveryOperationId ? { recoveryOperationId: value.recoveryOperationId } : {}),
          ...(value.authenticated === true ? { stationId: value.stationId } : {}) };
        if (replacement) {
          if (!/^[A-Za-z0-9_-]{43}$/.test(replacement) || !Number.isInteger(ttl) || ttl < 1 || ttl > 1800) fail(502, 'Respuesta inválida');
          res.setHeader('Set-Cookie', `${cookieName}=${replacement}; ${cookieAttributes}; Max-Age=${ttl}`);
        }
        if (url.pathname.endsWith('/logout')) res.setHeader('Set-Cookie', `${cookieName}=; ${cookieAttributes}; Max-Age=0`);
        res.statusCode = status; res.end(JSON.stringify(safe)); return;
      }
      const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
      if (req.method === 'GET' && ['/api/v1/fuels', '/api/v1/stations', '/api/v1/fuels/inventory'].includes(url.pathname)) {
        let upstream;
        try { upstream = await fetcher(backend + url.pathname, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(18000), headers: { Accept: 'application/json' } }); }
        catch { fail(503, 'Servicio temporalmente no disponible'); }
        if (!/^application\/json\b/i.test(upstream.headers.get('content-type') || '')) fail(502, 'Respuesta inválida');
        const content = await upstream.text();
        if (Buffer.byteLength(content) > 3000000) fail(502, 'Respuesta inválida');
        res.statusCode = upstream.status; res.end(content); return;
      }
      const terminalPath = url.pathname === '/api/v1/terminal/me' && req.method === 'GET' ||
        url.pathname === '/api/v1/terminal/claim' && req.method === 'POST' ||
        url.pathname === '/api/v1/terminal/operations' && req.method === 'POST' ||
        new RegExp(`^/api/v1/terminal/operations/${uuid}$`).test(url.pathname) && req.method === 'GET' ||
        new RegExp(`^/api/v1/terminal/operations/${uuid}/recovery-state$`).test(url.pathname) && req.method === 'GET' ||
        new RegExp(`^/api/v1/terminal/operations/${uuid}/close$`).test(url.pathname) && req.method === 'POST' ||
        url.pathname === '/api/v1/terminal/assistance' && req.method === 'POST' ||
        new RegExp(`^/api/v1/terminal/assistance/${uuid}$`).test(url.pathname) && req.method === 'GET' ||
        new RegExp(`^/api/v1/terminal/assistance/${uuid}/cancel$`).test(url.pathname) && req.method === 'POST';
      if (terminalPath) {
        if (!technical) fail(401, 'Sesión técnica requerida');
        if (req.method === 'POST' && (!terminalCsrf || !csrf || !equal(terminalCsrf, csrf))) fail(403, 'CSRF inválido');
        const { value, status } = await call(req.method, url.pathname, body, { terminal: technical });
        if (url.pathname === '/api/v1/terminal/me') {
          const csrfName = names.csrf;
          res.setHeader('Set-Cookie', `${csrfName}=${randomBytes(32).toString('base64url')}; Path=/; ${local ? '' : 'Secure; '}SameSite=Strict; Max-Age=28800`);
        }
        const safe = url.pathname === '/api/v1/terminal/claim'
          ? { claimed: value.claimed === true, activeOperationId: value.activeOperationId || null }
          : url.pathname.startsWith('/api/v1/terminal/assistance')
          ? { id: value.id, status: value.status, createdAt: value.createdAt, acceptedAt: value.acceptedAt, resolvedAt: value.resolvedAt, escalatedAt: value.escalatedAt, cancelledAt: value.cancelledAt }
          : url.pathname === '/api/v1/terminal/me'
          ? { code: value.code, pumpCode: value.pump?.code || null, prepared: value.prepared === true, canStart: value.canStart === true, operationalStatus: value.operationalStatus,
              activeOperationId: value.activeOperationId || null, emptyAttention: value.emptyAttention === true }
          : url.pathname.endsWith('/recovery-state')
          ? { operationId: value.operationId, number: value.number, status: value.status, closedAt: value.closedAt,
              terminalCode: value.terminalCode, pumpCode: value.pumpCode,
              order: value.order, payment: value.payment, authorization: value.authorization,
              reservation: value.reservation, sale: value.sale, receipt: value.receipt }
          : { operationId: value.operationId, status: value.status, closedAt: value.closedAt };
        res.statusCode = status; res.end(JSON.stringify(safe)); return;
      }
      if (!kioskRoute(req.method, url.pathname)) fail(403, 'Operación de terminal no permitida');
      if (!token || !csrf) fail(401, 'Inicia sesión de operador');
      const saleCreate = req.method === 'POST' && (['/api/v1/authorizations', '/api/v1/online-orders', '/api/v1/transactions'].includes(url.pathname) || new RegExp(`^/api/v1/online-orders/${uuid}/reselect$`).test(url.pathname));
      if (saleCreate && !technical) fail(401, 'Esta terminal no está disponible en este momento');
      const { value: session } = await call('POST', sessionPath + '/authorize', { method: req.method, path: url.pathname, ...(body ? { body } : {}) }, { terminal: technical });
      if (!session.allowed || typeof session.stationId !== 'string') fail(401, 'Inicia sesión de operador');
      // Station comes from authenticated server state, never from browser configuration.
      if (body?.stationId !== undefined && body.stationId !== session.stationId || body?.authorization?.stationId !== undefined && body.authorization.stationId !== session.stationId) fail(403, 'Estación no autorizada');
      const { value, status } = await call(req.method, url.pathname, body, { terminal: technical });
      res.statusCode = status; res.end(JSON.stringify(value));
    } catch (error) {
      res.statusCode = error instanceof GatewayError ? error.status : 503;
      res.end(JSON.stringify({ statusCode: res.statusCode, message: error instanceof GatewayError ? error.message : 'Servicio temporalmente no disponible' }));
    }
  };
}
