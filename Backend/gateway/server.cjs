const http = require('node:http');
const { URL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { serviceFor } = require('./routes.cjs');

const origins = Object.fromEntries(['identity','catalog','commerce','administration','print'].map(name =>
  [name, process.env[name.toUpperCase() + '_URL'] || `http://${name}-service:3000`]));
origins.ocr = process.env.OCR_URL || 'http://plate-recognition:8000';
const cors = (process.env.CORS_ORIGINS || '').split(',');
const timeout = 15000;
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (cors.includes(req.headers.origin)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Kiosk-Key,X-Request-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const path = req.url.split('?')[0];
  if (path === '/api/v1/health' || path === '/healthz') {
    const results = await Promise.all(Object.entries(origins).map(async ([name, origin]) => {
      try {
        const r = await fetch(origin + (name === 'ocr' ? '/health' : '/api/v1/health'), { signal: AbortSignal.timeout(3000) });
        return [name, r.ok ? 'up' : 'down'];
      } catch { return [name, 'down']; }
    }));
    const healthy = results.every(([, state]) => state === 'up');
    return json(res, healthy ? 200 : 503, { status: healthy ? 'ok' : 'degraded', services: Object.fromEntries(results) });
  }
  // Each domain exposes Swagger separately under /docs/<domain>/api/docs.
  const docs = path.match(/^\/docs\/(identity|catalog|commerce|administration)(\/.*)$/);
  const service = docs?.[1] || serviceFor(path);
  if (!service) return json(res, 404, { message: 'Ruta no encontrada', requestId: id });
  const targetPath = docs ? req.url.slice(('/docs/' + service).length) : req.url;
  const target = new URL(origins[service]);
  const started = Date.now();
  res.on('finish', () => console.log(JSON.stringify({ requestId: id, service, method: req.method, status: res.statusCode, durationMs: Date.now() - started })));
  const headers = { ...req.headers, host: target.host, 'x-request-id': id };
  // Drop hop-by-hop headers; retain cookies, authorization and exact signed path/body.
  for (const token of String(headers.connection || '').split(',')) delete headers[token.trim().toLowerCase()];
  for (const key of ['connection','keep-alive','proxy-authorization','proxy-authenticate','te','trailer','upgrade','transfer-encoding']) delete headers[key];
  const upstream = http.request({ hostname: target.hostname, port: target.port || 80,
    method: req.method, path: targetPath, headers, timeout }, response => {
    const out = { ...response.headers, 'x-request-id': id };
    delete out.connection;
    res.writeHead(response.statusCode, out);
    response.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', error => {
    console.error(JSON.stringify({ requestId: id, service, error: error.message }));
    if (!res.headersSent) json(res, 502, { message: 'Servicio temporalmente no disponible', requestId: id });
    else res.destroy();
  });
  req.on('aborted', () => upstream.destroy());
  // No automatic retries: operationId/idempotency remains owned by the business service.
  req.pipe(upstream);
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close());
