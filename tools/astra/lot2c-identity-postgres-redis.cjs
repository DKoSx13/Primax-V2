const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

function runArm(arm, fixtureSecret, family, images = []) {
  const repo = path.resolve(__dirname, '../..');
  const id = crypto.randomBytes(6).toString('hex');
  const project = 'primax-astra-lot2c-identity-' + id;
  const dir = path.join(repo, '.cache', 'astra-lot2c-identity', project);
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
  const subnet = Array.from({ length: 2048 }, (_, i) => `10.251.${Math.floor(i / 8)}.${(i % 8) * 32}/27`).find(candidate => {
    const [a, b] = range(candidate); return ranges.every(c => { const [x, y] = range(c); return b < x || y < a; });
  });
  assert(subnet, 'No unused validation subnet available');
  const referenceHead = 'a72e787deb03facf29989eab64949aec5d339950';
  const referenceDir = path.join(dir, 'reference'); fs.mkdirSync(referenceDir);
  const referenceFiles=['auth/auth.controller.ts','auth/admin.controller.ts','kiosk/kiosk.controller.ts'];
  for(const source of referenceFiles){const r=spawnSync('git',['show',referenceHead+':Backend/src/'+source],{cwd:repo,encoding:'utf8',shell:false,windowsHide:true});assert.equal(r.status,0);const target=path.join(referenceDir,source);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,r.stdout);}
  const sourceRoot=path.join(dir,'source-backend');fs.mkdirSync(sourceRoot);
  const tracked=spawnSync('git',['ls-files','-z','--','Backend'],{cwd:repo,encoding:'utf8',shell:false,windowsHide:true});assert.equal(tracked.status,0);
  const added=spawnSync('git',['ls-files','--others','--exclude-standard','-z','--','Backend/services/identity','Backend/test/lot2*','Backend/src/identity-adapters/lot2-boundaries.spec.ts'],{cwd:repo,encoding:'utf8',shell:false,windowsHide:true});assert.equal(added.status,0);
  const extras=fs.readdirSync(path.join(repo,'Backend/test/lot2-scenarios')).map(p=>'Backend/test/lot2-scenarios/'+p);
  for(const relative of [...new Set([...tracked.stdout.split('\0'),...added.stdout.split('\0'),...extras,'Backend/test/lot2c-identity.integration.cjs','Backend/test/lot2c-kiosk-scenario.cjs','Backend/src/auth/auth-core.module.ts','Backend/src/auth/demo-admin-enabled.ts','Backend/test/lot2-identity.fixture.ts'])].filter(Boolean)){
    if(relative.split('/').some(p=>p.startsWith('.env')||['node_modules','dist','build','.cache'].includes(p)))continue;
    const from=path.join(repo,relative),to=path.join(sourceRoot,relative.slice('Backend/'.length));if(!fs.existsSync(from))continue;assert(!fs.lstatSync(from).isSymbolicLink());fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
  }
  if(arm==='baseline')for(const source of referenceFiles)fs.copyFileSync(path.join(referenceDir,source),path.join(sourceRoot,'src',source));
  const compose = { name: project, services: {
    postgres: { image: postgresImage, environment: { POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: database },
      labels: { 'io.primax.validation': project }, volumes: [volume + ':/var/lib/postgresql/data'],
      healthcheck: { test: ['CMD-SHELL', 'pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'], interval: '1s', timeout: '3s', retries: 40 } },
    redis: { image: 'redis:7.4-alpine', command: ['redis-server', '--appendonly', 'yes', '--requirepass', redisPassword],
      environment: { REDISCLI_AUTH: redisPassword }, labels: { 'io.primax.validation': project }, volumes: [redisVolume + ':/data'],
      healthcheck: { test: ['CMD', 'redis-cli', 'ping'], interval: '1s', timeout: '3s', retries: 40 } },
    tester: { image: 'primax-astra-stage2-validation:test', entrypoint: ['node', '/integration.cjs'],
      environment: { APP_MODE: 'local', ASTRA_ARM: arm, ASTRA_TEST_FAMILY: family, ASTRA_FIXTURE_SECRET: fixtureSecret, PAYMENT_ENV: 'demo', DEMO_WALLET_ENABLED: 'true', DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, ASTRA_SYNTHETIC_DB: database, ASTRA_SYNTHETIC_USER: user, KIOSK_REDIS_URL: `redis://:${redisPassword}@redis:6379/0`, ASTRA_NAMESPACE: `lot2-identity_${id}` },
      labels: { 'io.primax.validation': project },
      volumes: [sourceRoot.replaceAll('\\', '/') + ':/source:ro',
        path.join(repo, 'Backend/test/lot2c-identity.integration.cjs').replaceAll('\\', '/') + ':/integration.cjs:ro',
        dir.replaceAll('\\', '/') + ':/evidence', referenceDir.replaceAll('\\', '/') + ':/reference:ro'] },
  }, networks: { default: { internal: true, ipam: { config: [{ subnet }] } } }, volumes: { [volume]: { external: true, name: volume }, [redisVolume]: { external: true, name: redisVolume } } };
  for (const image of images) compose.services['smoke-' + image.domain] = {
    image: image.tag, labels: { 'io.primax.validation': project },
    environment: { APP_MODE: 'local', DATABASE_URL: url, JWT_SECRET: fixtureSecret,
      KIOSK_API_KEY: fixtureSecret, KIOSK_GATEWAY_SECRET: fixtureSecret,
      KIOSK_STATION_ID: '11111111-1111-4111-8111-111111111111',
      KIOSK_REDIS_URL: `redis://:${redisPassword}@redis:6379/0`, KIOSK_SESSION_NAMESPACE: 'bootstrap_' + id,
      PORT: '3000', CORS_ORIGINS: 'http://localhost', PLATE_RECOGNITION_ENABLED: 'false',
      SHOW_DEMO_ADMIN_CREDENTIALS: 'false', PASSWORD_RESET_DELIVERY: 'disabled', SWAGGER_ENABLED: 'false' },
  };
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
    if (images.length) {
      const dump = name => docker([...base, 'exec', '-T', 'postgres', 'pg_dump', '-U', user, '-d', database,
        '--data-only', '--no-owner', '--no-privileges'], name).stdout.replace(/^\\(?:un)?restrict .+$/gm, '');
      const before = dump('bootstrap-database-before'), bootstraps = [];
      for (const image of images) {
        const service = 'smoke-' + image.domain;
        docker([...base, 'up', '-d', '--no-deps', service], service + '-start');
        const probe = `const assert=require('node:assert/strict');(async()=>{let response;for(let i=0;i<60;i++){try{response=await fetch('http://127.0.0.1:3000/api/v1/health');if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}assert(response&&response.ok);const health=await response.json();assert.equal(health.status,'ok');const auth=await fetch('http://127.0.0.1:3000/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(auth.status,${['identity','legacy'].includes(image.domain) ? 400 : 404});console.log(JSON.stringify({domain:${JSON.stringify(image.domain)},health,loginStatus:auth.status,realNestLifecycle:true}));})().catch(e=>{console.error(e);process.exitCode=1;});`;
        const result = docker([...base, 'exec', '-T', service, 'node', '-e', probe], service + '-health');
        bootstraps.push(JSON.parse(result.stdout.trim()));
        docker([...base, 'logs', '--no-color', service], service + '-logs');
        docker([...base, 'stop', '--timeout', '10', service], service + '-stop');
        console.log(image.domain + ': real image bootstrap and route separation passed');
      }
      const after = dump('bootstrap-database-after');
      assert.equal(after, before, 'Bootstrap/health changed persisted rows or sequences');
      fs.writeFileSync(path.join(dir, 'real-bootstraps.json'), JSON.stringify({ bootstraps,
        databaseDataAndSequencesUnchanged: true, databaseDumpSha256: crypto.createHash('sha256').update(before).digest('hex') }, null, 2));
    }
    console.log(arm + ': ' + family + ' verification passed; evidence: .cache/astra-lot2c-identity/' + project);
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
  return dir;
}
function main() {
  const secret=crypto.randomBytes(48).toString('hex'), results=[];
  if (process.argv[2] === '--bootstrap-images') {
    const images=JSON.parse(fs.readFileSync(process.argv[3]));assert.equal(images.length,5);
    runArm('candidate',secret,'catalog',images);return;
  }
  const families=['profile','security','kiosk','admin-ocr','catalog'];
  const selected=process.argv.slice(2);assert(selected.length===0||(selected.length===2&&selected[0]==='--family'&&families.includes(selected[1])),'Usage: node tools/astra/lot2c-identity-postgres-redis.cjs [--family profile|security|kiosk|admin-ocr|catalog]');
  for(const family of selected.length?[selected[1]]:families) {
    const baseline=runArm('baseline',secret,family),candidate=runArm('candidate',secret,family);
    const read=p=>JSON.parse(fs.readFileSync(path.join(p,'comparison-data.json')));
    const a=read(baseline),b=read(candidate);
    for(const item of [a,b]){for(const r of item.responses)if(r.label.startsWith('concurrent '))r.label='concurrent';item.responses.sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));}
    assert.deepEqual(b,a,'State/HTTP parity failed for '+family);
    const result={family,baseline:path.relative(repoRoot(),baseline).replaceAll('\\','/'),candidate:path.relative(repoRoot(),candidate).replaceAll('\\','/'),checksPerArm:a.checks.length,exactCanonicalComparisonPassed:true};
    fs.writeFileSync(path.join(candidate,'comparison-results.json'),JSON.stringify(result,null,2)+'\n');results.push(result);console.log(family+': exact reference/candidate comparison passed');
  }
  const final=path.join(repoRoot(),results.at(-1).candidate,'all-comparisons.json');fs.writeFileSync(final,JSON.stringify(results,null,2)+'\n');
}
function repoRoot(){return path.resolve(__dirname,'../..');}
if(require.main===module){try{main();}catch(error){fs.writeFileSync(path.join(repoRoot(),'.cache/astra-lot2c-identity/last-comparison-error.log'),String(error.stack));console.error(error.message.split('\n').slice(0,10).join('\n'));process.exitCode=1;}}
