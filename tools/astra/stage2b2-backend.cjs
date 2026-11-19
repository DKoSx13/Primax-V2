// Network-private catalogue fixture. No database, account, payment or printer.
const http = require('node:http');
let hold = false;
const waiting = new Set();
const counts = {};
const fuels = [{ code: 'FIXTURE', pricePerGallon: '1.00' }];
const reply = (res, body) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const server = http.createServer((req, res) => {
  if (req.url === '/_test/hold') { hold = true; return reply(res, { ok: true }); }
  if (req.url === '/_test/release') {
    hold = false;
    for (const response of waiting) reply(response, fuels);
    waiting.clear();
    return reply(res, { ok: true });
  }
  if (req.url === '/_test/status') return reply(res, { waiting: waiting.size, counts });
  counts[req.url] = (counts[req.url] || 0) + 1;
  if (req.url === '/api/v1/fuels' && hold) {
    waiting.add(res);
    res.on('close', () => waiting.delete(res));
    return;
  }
  reply(res, req.url === '/api/v1/fuels' ? fuels : []);
}).listen(3000, '0.0.0.0');
process.on('SIGTERM', () => { server.close(); server.closeIdleConnections(); });
