const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomBytes } = require('node:crypto');

test('CI passes explicit local fixtures in memory without defaults, logs or writes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');
  const block = source.match(/          node <<'NODE'\r?\n([\s\S]*?)          NODE/);
  assert(block, 'Missing CI fixture block');
  const code = block[1].replace(/^          /gm, '');
  const opaque = () => randomBytes(24).toString('hex');
  const fixture = { member: opaque(), control: opaque() };
  const passwords = { DEMO_PASSWORD: opaque(), DEMO_CONTROL_ADMIN_PASSWORD: opaque() };
  let reads = 0, ran = false, exit;
  const subprocess = {
    execFileSync(command, args, options) {
      assert.equal(command, 'docker');
      assert.equal(options.encoding, 'utf8');
      if (reads++ === 0) {
        assert.deepEqual(Array.from(args), ['compose', 'config', '--format', 'json']);
        return JSON.stringify({ services: { postgres: { environment: { POSTGRES_USER: 'fixture-user', POSTGRES_DB: 'fixture-db' } }, seed: { environment: passwords } } });
      }
      assert.deepEqual(Array.from(args), ['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'fixture-user', '-d', 'fixture-db']);
      assert.match(options.input, /^BEGIN READ ONLY;/);
      assert.match(options.input, /COMMIT;$/);
      assert(!/UPDATE|INSERT|DELETE|ALTER|DROP/i.test(options.input));
      return JSON.stringify(fixture);
    },
    spawnSync(command, args, options) {
      assert.equal(command, 'fixture-node');
      assert.deepEqual(Array.from(args), ['tools/smoke-microservices.cjs']);
      assert.equal(options.stdio, 'inherit');
      assert.equal(options.env.DEMO_MEMBER_EMAIL, fixture.member);
      assert.equal(options.env.DEMO_CONTROL_ADMIN_EMAIL, fixture.control);
      assert.equal(options.env.DEMO_PASSWORD, passwords.DEMO_PASSWORD);
      assert.equal(options.env.DEMO_CONTROL_ADMIN_PASSWORD, passwords.DEMO_CONTROL_ADMIN_PASSWORD);
      ran = true;
      return { status: 0 };
    },
  };
  vm.runInNewContext(code, {
    require(name) { assert.equal(name, 'node:child_process'); return subprocess; },
    process: { execPath: 'fixture-node', env: {}, exit(status) { exit = status; } },
    console: { log() { assert.fail('Fixture values must not be logged'); }, error() { assert.fail('Unexpected fixture preparation failure'); } },
  });
  assert.equal(reads, 2);
  assert(ran);
  assert.equal(exit, 0);
});

test('CI does not disclose subprocess stdout, stderr or messages on preparation failure', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');
  const block = source.match(/          node <<'NODE'\r?\n([\s\S]*?)          NODE/);
  const secret = randomBytes(24).toString('hex');
  const messages = []; let exit;
  vm.runInNewContext(block[1].replace(/^          /gm, ''), {
    require() { return {
      execFileSync() { throw Object.assign(new Error(secret), { stdout: secret, stderr: secret }); },
      spawnSync() { assert.fail('Smoke must not start after fixture failure'); },
    }; },
    process: { exit(code) { exit = code; } },
    console: { error(message) { messages.push(message); }, log() { assert.fail('No raw output allowed'); } },
  });
  assert.equal(exit, 1);
  assert.deepEqual(messages, ['Unable to prepare explicit smoke fixtures for this CI demo stack']);
  assert(!messages.join('').includes(secret));
});
