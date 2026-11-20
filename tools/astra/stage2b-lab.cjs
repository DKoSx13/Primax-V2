// Private integration harness. Never loads .env, accepts external resource names,
// deletes volumes, or starts the operational compose project.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const folder = path.join(root, '.cache/astra-stage2b');
const statePath = path.join(folder, 'private-state.json');
const file = path.join(folder, 'compose.json');
const cliEnv = Object.fromEntries(['PATH', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData', 'ALLUSERSPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
function docker(args, input) {
  const r = spawnSync('docker', args, { cwd: root, env: cliEnv, encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw Error(r.stderr || r.stdout || r.error?.message || 'Docker failed');
  return r.stdout;
}
function load() { return JSON.parse(fs.readFileSync(statePath)); }
function compose(args, input) {
  const s = load();
  return docker(['compose', '--env-file', path.join(folder, 'empty.env'), '-p', s.project, '-f', file, ...args], input);
}
function assertResources() {
  const s = load(), c = JSON.parse(compose(['config', '--format', 'json']));
  if (!/^primax-astra-stage2b-[a-f0-9]{10}$/.test(s.project) || c.name !== s.project) throw Error('Project mismatch');
  for (const group of [c.volumes, c.networks]) for (const r of Object.values(group))
    if (r.external || !r.name.startsWith(s.project + '_')) throw Error('Shared resource rejected');
  for (const service of Object.values(c.services)) {
    if (service.container_name || (service.volumes || []).some(v => v.type !== 'volume')) throw Error('Unsafe mount/name');
    for (const p of service.ports || []) if (p.host_ip !== '127.0.0.1' || !s.ports.includes(Number(p.published))) throw Error('Unsafe port');
    if (service.environment?.DATABASE_URL && !service.environment.DATABASE_URL.includes('@postgres:5432/stage2b_synthetic?')) throw Error('Database mismatch');
  }
  return c;
}
function snapshot() {
  assertResources(); const s = load();
  const containers = docker(['ps', '-aq', '--filter', 'label=com.docker.compose.project=' + s.project]).trim().split(/\s+/).filter(Boolean);
  const data = containers.length ? JSON.parse(docker(['inspect', ...containers])) : [];
  return data.map(c => ({ id: c.Id, name: c.Name, service: c.Config.Labels['com.docker.compose.service'], project: c.Config.Labels['com.docker.compose.project'], state: c.State.Status, health: c.State.Health?.Status, exitCode: c.State.ExitCode, image: c.Config.Image, mounts: c.Mounts.map(m => ({ type: m.Type, name: m.Name, destination: m.Destination })), ports: c.NetworkSettings.Ports }));
}
async function main() {
  const action = process.argv[2];
  if (action === 'prepare') {
    if (fs.existsSync(statePath)) throw Error('Existing run preserved; do not overwrite');
    fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, 'empty.env'), '');
    const project = 'primax-astra-stage2b-' + randomBytes(5).toString('hex');
    const ports = [29100, 29181, 29182, 29183, 29184];
    for (const port of ports) await new Promise((resolve, reject) => { const server = require('node:net').createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
    const secret = () => 'SyntheticStage2B_' + randomBytes(24).toString('hex');
    const values = { COMPOSE_PROJECT_NAME: project, BACKEND_PORT: '' + ports[0], FRONTEND1_PORT: '' + ports[1], FRONTEND2_PORT: '' + ports[2], FRONTEND3_PORT: '' + ports[3], FRONTEND1_T02_PORT: '' + ports[4], POSTGRES_USER: 'stage2b', POSTGRES_DB: 'stage2b_synthetic', POSTGRES_PASSWORD: secret(), REDIS_PASSWORD: secret(), JWT_SECRET: secret(), KIOSK_API_KEY: secret(), KIOSK_GATEWAY_SECRET: secret(), OCR_SERVICE_SECRET: secret(), DEMO_PASSWORD: secret(), DEMO_CONTROL_ADMIN_PASSWORD: secret(), DEMO_ENCARGADO_PASSWORD: secret(), KIOSK_OPERATOR_USER: 'stage2b-operator', CORS_ORIGINS: ports.flatMap(p => ['http://localhost:' + p, 'http://127.0.0.1:' + p]).join(',') };
    const hash = docker(['run', '--rm', '-i', '--network', 'none', 'primax-astra-stage2-baseline:test', 'node', '-e', "const fs=require('fs');console.log(require('bcryptjs').hashSync(fs.readFileSync(0,'utf8'),12))"], secret()).trim();
    values.KIOSK_OPERATOR_PASSWORD_HASH = hash;
    const r = spawnSync('docker', ['compose', '--env-file', path.join(folder, 'empty.env'), '-p', project, '-f', path.join(root, 'compose.yaml'), 'config', '--format', 'json'], { env: { ...cliEnv, ...values }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    if (r.status !== 0) throw Error(r.stderr);
    const c = JSON.parse(r.stdout); c.name = project;
    for (const [name, service] of Object.entries(c.services)) {
      service.restart = 'no';
      if (service.environment?.KIOSK_SESSION_NAMESPACE) service.environment.KIOSK_SESSION_NAMESPACE = project;
      if (service.environment?.KIOSK_OPERATOR_PASSWORD_HASH) service.environment.KIOSK_OPERATOR_PASSWORD_HASH = hash.replaceAll('$', () => '$$');
      if (service.build) service.image = project + '-' + name + ':validation';
    }
    for (const name of ['migrate', 'seed', 'seed-control-admin', 'seed-operations', 'backend']) { delete c.services[name].build; c.services[name].image = 'primax-astra-stage2-baseline:test'; c.services[name].pull_policy = 'never'; }
    delete c.services['backend-tests'];
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'Docs/astra/evidence/stage2-independent-packaging.json'))).images;
    for (const service of ['identity', 'catalog', 'administration', 'commerce']) {
      const item = c.services[service + '-service']; delete item.build; delete item.command;
      item.image = 'primax-astra-' + service + ':stage2'; item.pull_policy = 'never';
      const [image] = JSON.parse(docker(['image', 'inspect', item.image]));
      if (image.Id !== expected.find(i => i.service === service).id) throw Error('Image identity mismatch');
    }
    for (const r of Object.values(c.networks)) r.internal = true;
    // Explicit, small subnets avoid the exhausted automatic Docker pools on
    // this host. Reject overlaps; host routes were separately reviewed.
    const cidrs = ['10.253.212.0/26', '10.253.212.64/27', '10.253.212.96/27'];
    const ids = docker(['network', 'ls', '-q']).trim().split(/\s+/).filter(Boolean);
    const nets = ids.length ? JSON.parse(docker(['network', 'inspect', ...ids])) : [];
    function range(cidr) { const [ip, bits] = cidr.split('/'), value = ip.split('.').reduce((n, v) => n * 256 + Number(v), 0), size = 2 ** (32 - Number(bits)); return [Math.floor(value / size) * size, Math.floor(value / size) * size + size - 1]; }
    for (const cidr of cidrs) for (const n of nets) for (const config of n.IPAM.Config || []) {
      if (!config.Subnet?.includes('.')) continue;
      const [a, b] = range(cidr), [v, w] = range(config.Subnet);
      if (a <= w && v <= b) throw Error('Proposed subnet overlaps an existing network');
    }
    c.networks.data.ipam = { config: [{ subnet: cidrs[0] }] };
    c.networks.web.ipam = { config: [{ subnet: cidrs[1] }] };
    c.networks.edge = { name: project + '_edge', ipam: { config: [{ subnet: cidrs[2] }] } };
    // Docker's internal networks did not publish host ports. Only the Gateway
    // and static frontends join edge; PostgreSQL/Redis/domains remain internal.
    for (const n of ['backend', 'frontend1', 'frontend2', 'frontend3', 'fuelflow-t02']) c.services[n].networks.edge = { gw_priority: 1 };
    c.services.postgres.healthcheck.test = ['CMD-SHELL', 'pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'];
    c.services.redis.healthcheck.test = ['CMD-SHELL', 'redis-cli -a "$$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG'];
    for (const group of [c.volumes, c.networks]) for (const r of Object.values(group)) {
      const type = group === c.volumes ? 'volume' : 'network';
      const existing = spawnSync('docker', [type, 'inspect', r.name], { env: cliEnv, windowsHide: true, stdio: 'ignore' });
      if (existing.status === 0) throw Error('Existing resource rejected');
    }
    fs.writeFileSync(file, JSON.stringify(c, null, 2)); fs.writeFileSync(statePath, JSON.stringify({ project, ports, values }, null, 2));
    assertResources(); console.log('Prepared exclusive project ' + project);
  } else if (action === 'up') { assertResources(); console.log(compose(['up', '-d', '--build', '--wait', '--wait-timeout', '240'])); }
  else if (action === 'status') { console.log(JSON.stringify(snapshot(), null, 2)); }
  else if (action === 'stop') { assertResources(); console.log(compose(['stop', '--timeout', '30'])); }
  else if (action === 'reference' || action === 'candidate') {
    assertResources(); const s = load(), c = JSON.parse(fs.readFileSync(file));
    const domains = ['identity', 'catalog', 'administration', 'commerce'];
    console.log(compose(['stop', ...domains.map(n => n + '-service')]));
    for (const domain of domains) {
      const item = c.services[domain + '-service']; item.user = 'node';
      item.image = action === 'reference' ? 'primax-astra-stage2-baseline:test' : 'primax-astra-' + domain + ':stage2';
      if (action === 'reference') item.command = ['node', 'dist/src/apps/' + domain + '/main.js']; else delete item.command;
    }
    s.mode = action; fs.writeFileSync(statePath, JSON.stringify(s, null, 2)); fs.writeFileSync(file, JSON.stringify(c, null, 2));
    assertResources(); console.log(compose(['up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '120', ...domains.map(n => n + '-service')]));
  }
  else if (action === 'smoke') {
    const c = assertResources(), s = load();
    if (snapshot().some(x => !['running', 'exited'].includes(x.state))) throw Error('Unexpected state');
    const r = spawnSync(process.execPath, [path.join(root, 'tools/stage2b-smoke.cjs')], { cwd: root, env: { ...cliEnv, ...s.values, FRONTEND1_PORT: '' + s.ports[4], STAGE2B_MODE: s.mode || 'candidate', API_ORIGIN: 'http://127.0.0.1:' + s.ports[0] }, stdio: 'inherit', windowsHide: true });
    void c; if (r.status !== 0) process.exitCode = 1;
  } else throw Error('prepare|up|status|smoke|reference|candidate|stop');
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { root, folder, load, compose, docker, assertResources, snapshot };
