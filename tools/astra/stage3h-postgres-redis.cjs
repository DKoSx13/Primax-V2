const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

function main() {
  const repo = path.resolve(__dirname, '../..');
  const id = crypto.randomBytes(6).toString('hex');
  const project = 'primax-astra-stage3h-' + id;
  const dir = path.join(repo, '.cache', 'astra-stage3h', project);
  fs.mkdirSync(dir, { recursive: true });
  const volume = project + '-pgdata';
  const password = crypto.randomBytes(48).toString('hex');
  const redisPassword = crypto.randomBytes(48).toString('hex');
  const redisVolume = project + '-redisdata';
  const user = 'lab_' + id, database = 'synthetic_' + id;
  const url = `postgresql://${user}:${password}@postgres:5432/${database}?schema=public`;
  const postgresImage = 'postgres:17.6-bookworm';
  function docker(args, name, allowFailure = false) {
    const r = spawnSync('docker', args, { encoding: 'utf8', shell: false, windowsHide: true });
    fs.writeFileSync(path.join(dir, name + '.log'), (r.stdout || '') + (r.stderr || ''));
    if (!allowFailure && (r.error || r.status !== 0)) throw new Error('Isolated PostgreSQL step failed: ' + name);
    return r;
  }
  const networkIds = docker(['network', 'ls', '-q'], 'network-inventory').stdout.trim().split(/\s+/).filter(Boolean);
  const existingNetworks = networkIds.length ? JSON.parse(docker(['network', 'inspect', ...networkIds], 'network-ranges').stdout) : [];
  const ranges = existingNetworks.flatMap(n => n.IPAM?.Config || []).map(c => c.Subnet).filter(c => c && !c.includes(':'));
  function range(cidr) {
    const [ip, prefix] = cidr.split('/');
    const value = ip.split('.').reduce((n, part) => (n << 8n) + BigInt(part), 0n);
    const size = 1n << BigInt(32 - Number(prefix));
    const start = value / size * size; return [start, start + size - 1n];
  }
  const subnet = Array.from({ length: 8 }, (_, i) => `10.253.220.${i * 32}/27`).find(candidate => {
    const [a, b] = range(candidate); return ranges.every(c => { const [x, y] = range(c); return b < x || y < a; });
  });
  assert(subnet, 'No unused validation subnet available');
  const referenceHead = '5bd1369166238913eec86796bbcd0d93a9ed5e4f';
  const referenceDir = path.join(dir, 'reference'); fs.mkdirSync(referenceDir);
  for (const [name, source] of [['customers.ts', 'Backend/src/control/control-customers.service.ts']]) {
    const result = spawnSync('git', ['show', referenceHead + ':' + source], { cwd: repo, encoding: 'utf8', shell: false, windowsHide: true });
    assert.equal(result.status, 0); fs.writeFileSync(path.join(referenceDir, name), result.stdout);
  }
  const compose = { name: project, services: {
    postgres: { image: postgresImage, environment: { POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: database },
      labels: { 'io.primax.validation': project }, volumes: [volume + ':/var/lib/postgresql/data'],
      healthcheck: { test: ['CMD-SHELL', 'pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'], interval: '1s', timeout: '3s', retries: 40 } },
    redis: { image: 'redis:7.4-alpine', command: ['redis-server', '--appendonly', 'yes', '--requirepass', redisPassword],
      environment: { REDISCLI_AUTH: redisPassword }, labels: { 'io.primax.validation': project }, volumes: [redisVolume + ':/data'],
      healthcheck: { test: ['CMD', 'redis-cli', 'ping'], interval: '1s', timeout: '3s', retries: 40 } },
    tester: { image: 'primax-astra-stage2-validation:test', entrypoint: ['node', '/integration.cjs'],
      environment: { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, ASTRA_SYNTHETIC_DB: database, ASTRA_SYNTHETIC_USER: user, KIOSK_REDIS_URL: `redis://:${redisPassword}@redis:6379/0`, ASTRA_NAMESPACE: `stage3h_${id}` },
      labels: { 'io.primax.validation': project },
      volumes: [path.join(repo, 'Backend').replaceAll('\\', '/') + ':/source:ro',
        path.join(repo, 'Backend/test/administration-details.integration.cjs').replaceAll('\\', '/') + ':/integration.cjs:ro',
        dir.replaceAll('\\', '/') + ':/evidence', referenceDir.replaceAll('\\', '/') + ':/reference:ro'] },
  }, networks: { default: { internal: true, ipam: { config: [{ subnet }] } } }, volumes: { [volume]: { external: true, name: volume }, [redisVolume]: { external: true, name: redisVolume } } };
  const file = path.join(dir, 'compose.json');
  fs.writeFileSync(file, JSON.stringify(compose, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const base = ['compose', '--project-name', project, '--file', file];
  let started = false;
  try {
    for (const checkedVolume of [volume, redisVolume]) {
    assert.equal(docker(['volume', 'inspect', checkedVolume], 'volume-must-not-exist-' + checkedVolume, true).status === 0, false);
    assert.equal(docker(['ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project], 'project-must-be-empty').stdout.trim(), '');
    docker(['volume', 'create', '--label', 'io.primax.validation=' + project, checkedVolume], 'create-volume-' + checkedVolume);
    const v = JSON.parse(docker(['volume', 'inspect', checkedVolume], 'verify-volume-' + checkedVolume).stdout)[0];
    assert.equal(v.Labels['io.primax.validation'], project);
    docker(['run', '--rm', '--network', 'none', '--mount', `type=volume,source=${checkedVolume},target=/checked,readonly`,
      '--entrypoint', 'sh', postgresImage, '-c', 'test -z "$(ls -A /checked)"'], 'verify-empty-volume-' + checkedVolume);
    }
    // PostgreSQL initialization can now write only to this newly verified volume.
    started = true;
    docker([...base, 'up', '-d', '--wait', '--wait-timeout', '60', 'postgres', 'redis'], 'start-postgres');
    const container = docker([...base, 'ps', '-q', 'postgres'], 'postgres-id').stdout.trim();
    const c = JSON.parse(docker(['inspect', container], 'verify-postgres').stdout)[0];
    assert.equal(c.Config.Labels['com.docker.compose.project'], project);
    assert.equal(c.Mounts.length, 1); assert.equal(c.Mounts[0].Name, volume);
    assert.equal(Object.keys(c.HostConfig.PortBindings || {}).length, 0);
    const redisContainer = docker([...base, 'ps', '-q', 'redis'], 'redis-id').stdout.trim();
    const redisState = JSON.parse(docker(['inspect', redisContainer], 'verify-redis').stdout)[0];
    assert.equal(redisState.Config.Labels['com.docker.compose.project'], project);
    assert.equal(redisState.Mounts.length, 1); assert.equal(redisState.Mounts[0].Name, redisVolume);
    assert.equal(Object.keys(redisState.HostConfig.PortBindings || {}).length, 0);
    const networks = Object.keys(c.NetworkSettings.Networks);
    assert.deepEqual(Object.keys(redisState.NetworkSettings.Networks), networks); assert.equal(networks.length, 1);
    const n = JSON.parse(docker(['network', 'inspect', networks[0]], 'verify-network').stdout)[0];
    assert.equal(n.Internal, true); assert.equal(n.Labels['com.docker.compose.project'], project);
    fs.writeFileSync(path.join(dir, 'isolation.json'), JSON.stringify({ project, volume, redisVolume, newVolumesVerifiedEmpty: true,
      volumeOwned: true, expectedMountVerified: true, internalNetwork: true, subnet, publishedPorts: 0,
      databases: 1, migrationsTargetVerifiedBeforeExecution: true }, null, 2) + '\n');
    console.log(project + ': new empty volume, owned PostgreSQL mount and private network verified');
    docker([...base, 'run', '--rm', '--no-deps', 'tester'], 'integration');
    console.log('Administration details comparison passed; evidence: .cache/astra-stage3h/' + project);
  } finally {
    if (started) {
      docker([...base, 'stop', '--timeout', '10'], 'stop-owned-project');
      const ids = docker([...base, 'ps', '--all', '-q'], 'final-container-ids').stdout.trim().split(/\s+/).filter(Boolean);
      const states = ids.map(cid => {
        const c = JSON.parse(docker(['inspect', cid], 'final-state-' + cid.slice(0, 12)).stdout)[0];
        assert.equal(c.Config.Labels['com.docker.compose.project'], project);
        assert.equal(c.State.Running, false);
        return { service: c.Config.Labels['com.docker.compose.service'], exitCode: c.State.ExitCode, running: c.State.Running };
      });
      fs.writeFileSync(path.join(dir, 'final-states.json'), JSON.stringify(states, null, 2) + '\n');
    }
  }
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
