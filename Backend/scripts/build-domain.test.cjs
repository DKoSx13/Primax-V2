const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildDomain } = require('./build-domain.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'primax packaging '));
  t.after(() => {
    // Only the verified temporary fixture belongs to this test.
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert(path.basename(resolved).startsWith('primax packaging '));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  function write(relative, value = 'fixture') {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  }
  write('scripts/database-safety.cjs', 'module.exports = { fixture: true };\n');
  write('services/identity/tsconfig.build.json', '{}');
  write('services/identity/dist/old.js', 'previous successful artifact');
  write('services/catalog/dist/keep.js', 'sibling artifact');
  write('dist/keep.js', 'legacy artifact');
  return { root, write };
}

function compiler(root, extra = () => {}) {
  return (command, args, options) => {
    assert.equal(command, process.execPath);
    assert.equal(options.shell, false);
    assert.equal(options.cwd, root);
    assert.equal(args[2], path.join(root, 'services/identity/tsconfig.build.json'));
    const output = args[4];
    assert.equal(path.dirname(output), path.join(root, 'services/identity'));
    fs.mkdirSync(path.join(output, 'src/apps/identity'), { recursive: true });
    fs.writeFileSync(path.join(output, 'src/apps/identity/main.js'), 'compiled fixture');
    fs.mkdirSync(path.join(output, 'src/prisma'), { recursive: true });
    fs.writeFileSync(path.join(output, 'src/prisma/prisma.service.js'), 'required runtime adapter');
    extra(output);
    return { status: 0 };
  };
}

test('publishes a fresh artifact with required runtime support, preserving other builds', (t) => {
  const { root } = fixture(t);
  const manifest = buildDomain('identity', { root, compiler: 'fixture compiler', run: compiler(root) });
  const output = path.join(root, 'services/identity/dist');
  assert(!fs.existsSync(path.join(output, 'old.js')));
  assert.equal(fs.readFileSync(path.join(root, 'dist/keep.js'), 'utf8'), 'legacy artifact');
  assert.equal(fs.readFileSync(path.join(root, 'services/catalog/dist/keep.js'), 'utf8'), 'sibling artifact');
  const support = fs.readFileSync(path.join(output, 'scripts/database-safety.cjs'));
  assert.equal(manifest.files['scripts/database-safety.cjs'], crypto.createHash('sha256').update(support).digest('hex'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'build-manifest.json'))), manifest);
  assert(!fs.existsSync(path.join(root, 'services/identity/build/packaging.lock')));
  assert(!fs.readdirSync(path.join(root, 'services/identity')).some((name) => name.startsWith('build-')));
});

test('failed compilation preserves the previous artifact and removes temporary output/lock', (t) => {
  const { root } = fixture(t);
  assert.throws(() => buildDomain('identity', {
    root, compiler: 'fixture compiler', run: () => ({ status: 2 }),
  }), /Compilation failed/);
  assert.equal(fs.readFileSync(path.join(root, 'services/identity/dist/old.js'), 'utf8'), 'previous successful artifact');
  assert(!fs.existsSync(path.join(root, 'services/identity/build/packaging.lock')));
  assert(!fs.readdirSync(path.join(root, 'services/identity')).some((name) => name.startsWith('build-')));
});

test('rejects path traversal and unknown services before running a compiler', (t) => {
  const { root } = fixture(t);
  for (const service of ['../identity', '/tmp', 'Identity', 'gateway', undefined]) {
    assert.throws(() => buildDomain(service, { root, run: () => assert.fail('compiler ran') }), /Expected one of/);
  }
});

test('a concurrent build of the same service cannot replace an existing artifact', (t) => {
  const { root, write } = fixture(t);
  write('services/identity/build/packaging.lock', 'another compiler owns this lock');
  assert.throws(() => buildDomain('identity', { root, run: () => assert.fail('compiler ran') }), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(path.join(root, 'services/identity/dist/old.js'), 'utf8'), 'previous successful artifact');
});

for (const unwanted of ['src/apps/commerce/main.js', 'prisma/seed.js', 'src/auth/auth.service.spec.js']) {
  test('refuses unexpected emitted code: ' + unwanted, (t) => {
    const { root } = fixture(t);
    const run = compiler(root, (output) => {
      fs.mkdirSync(path.dirname(path.join(output, unwanted)), { recursive: true });
      fs.writeFileSync(path.join(output, unwanted), 'unexpected');
    });
    assert.throws(() => buildDomain('identity', { root, compiler: 'fixture compiler', run }), /Another service|Test or Prisma/);
    assert(fs.existsSync(path.join(root, 'services/identity/dist/old.js')));
  });
}

test('missing entrypoint cannot replace a previous successful artifact', (t) => {
  const { root } = fixture(t);
  assert.throws(() => buildDomain('identity', { root, compiler: 'fixture compiler', run: () => ({ status: 0 }) }), /Missing service entrypoint/);
  assert(fs.existsSync(path.join(root, 'services/identity/dist/old.js')));
});

test('a symlink output cannot delete or write another directory', (t) => {
  const { root, write } = fixture(t);
  write('protected/keep.js', 'untouched');
  // Replace only the fixture output, never a workspace output.
  const output = path.resolve(root, 'services/identity/dist');
  assert.equal(path.dirname(output), path.join(root, 'services/identity'));
  fs.rmSync(output, { recursive: true });
  try {
    fs.symlinkSync(path.join(root, 'protected'), output, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('Host does not permit test symlinks');
    throw error;
  }
  assert.throws(() => buildDomain('identity', { root, run: () => assert.fail('compiler ran') }), /symlinks/);
  assert.equal(fs.readFileSync(path.join(root, 'protected/keep.js'), 'utf8'), 'untouched');
});
