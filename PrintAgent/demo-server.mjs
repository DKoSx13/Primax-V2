// Local demonstration only. Does not load Windows drivers or submit physical jobs.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateReceipt } from './contract.mjs';

http.createServer(async (req, res) => {
  const reply = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.url === '/api/v1/health') return reply(200, { status: 'ok', simulation: true });
  const match = /^\/api\/v1\/demo-print\/jobs\/(receipt-[a-zA-Z0-9-]{1,100})$/.exec(req.url);
  if (!match) return reply(404, { error: 'Ruta no encontrada' });
  if (!['GET','POST'].includes(req.method)) return reply(405, { error: 'Método no permitido' });
  const id = match[1], file = '/data/' + id + '.json';
  try {
    if (req.method === 'GET') {
      try { return reply(200, JSON.parse(await readFile(file, 'utf8')).job); }
      catch (error) { if (error.code === 'ENOENT') return reply(404, {}); throw error; }
    }
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) return reply(413, { error: 'Comprobante demasiado grande' });
      chunks.push(chunk);
    }
    const receipt = validateReceipt(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (id !== 'receipt-' + receipt.id) return reply(400, { error: 'Identificador incompatible' });
    const hash = createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
    const job = { id, status: 'accepted', simulation: true, physicalConfirmed: false,
      message: 'Simulación local: comprobante guardado; no se imprimió papel.' };
    try { await writeFile(file, JSON.stringify({ hash, receipt, job }), { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = JSON.parse(await readFile(file, 'utf8'));
      if (existing.hash !== hash) return reply(409, { error: 'El comprobante ya existe con otros datos' });
    }
    return reply(200, job);
  } catch (error) { return reply(400, { error: error.message }); }
}).listen(3000, '0.0.0.0');
