import { createServer } from 'node:http';
import { createGateway } from './gateway.js';

const gateway = createGateway();
let draining = false;
let activeRequests = 0;
let serverClosed = false;
let deadline;

function finishShutdown() {
  if (draining && serverClosed && activeRequests === 0) {
    clearTimeout(deadline);
    process.exitCode ??= 0;
  }
}

const server = createServer(async (req, res) => {
  if (draining) {
    res.writeHead(503, { Connection: 'close', 'Content-Length': '0' });
    res.end();
    return;
  }
  activeRequests++;
  try {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('ok\n');
      return;
    }
    await gateway(req, res);
  } finally {
    activeRequests--;
    finishShutdown();
  }
}).listen(3001, '0.0.0.0');

function shutdown() {
  if (draining) return;
  draining = true;
  // Leave a two-second margin inside Compose's ten-second stop budget.
  deadline = setTimeout(() => {
    console.error('BFF shutdown deadline exceeded: pending HTTP work; exit 1.');
    server.closeAllConnections();
    process.exit(1);
  }, 8000);
  deadline.unref();
  server.close(error => {
    if (error) {
      console.error('BFF shutdown failed: HTTP server could not close.');
      process.exitCode = 1;
    }
    serverClosed = true;
    finishShutdown();
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
