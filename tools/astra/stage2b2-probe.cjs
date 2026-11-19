// JSON-line test client inside the exclusive network; never accesses Docker.
const http = require('node:http');
const net = require('node:net');
const readline = require('node:readline');
const connections = new Map();
const targets = { backend: 3000, 'bff-t01': 3001, 'bff-t02': 3001, print: 3000 };
function target(name) {
  if (!Object.hasOwn(targets, name)) throw Error('Unknown test target');
  return { host: name, port: targets[name] };
}
function request(m) {
  return new Promise(resolve => {
    const req = http.request({ ...target(m.target), path: m.path, method: m.method || 'GET', headers: m.headers || {}, agent: false }, res => {
      const chunks = [];
      res.on('data', b => chunks.push(b));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(3000, () => req.destroy(Error('Probe timeout')));
    req.on('error', e => resolve({ networkError: e.code || 'REQUEST_FAILED' }));
    req.end(m.body);
  });
}
async function command(m) {
  if (m.op === 'request') return request(m);
  if (m.op === 'open') {
    const socket = net.createConnection(target(m.target));
    const state = { socket, chunks: [], error: null };
    state.done = new Promise(resolve => socket.once('close', () => resolve({ text: Buffer.concat(state.chunks).toString(), error: state.error })));
    socket.on('data', b => state.chunks.push(b));
    socket.on('error', e => { state.error = e.code || 'SOCKET_ERROR'; });
    socket.setTimeout(12000, () => socket.destroy());
    connections.set(m.key, state);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    socket.write(m.text);
    return { sent: true };
  }
  const state = connections.get(m.key);
  if (!state) throw Error('Unknown test connection');
  if (m.op === 'append') { state.socket.write(m.text); return { sent: true }; }
  if (m.op === 'received') return { bytes: Buffer.concat(state.chunks).length };
  if (m.op === 'collect') { const result = await state.done; connections.delete(m.key); return result; }
  throw Error('Unknown probe command');
}
const input = readline.createInterface({ input: process.stdin });
input.on('line', async line => {
  let m;
  try { m = JSON.parse(line); console.log(JSON.stringify({ id: m.id, result: await command(m) })); }
  catch (e) { console.log(JSON.stringify({ id: m?.id, error: e.code || 'PROBE_FAILED' })); }
});
input.on('close', () => { for (const x of connections.values()) x.socket.destroy(); });
