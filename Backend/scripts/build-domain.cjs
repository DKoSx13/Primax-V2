const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const services = Object.freeze(['identity', 'catalog', 'administration', 'commerce']);

// Check every output ancestor before creating, renaming or recursively removing
// generated files. A service name never becomes an arbitrary filesystem path.
function assertLocalPath(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Build output must stay inside Backend');
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error('Build output cannot follow symlinks');
  }
}

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Unexpected artifact symlink');
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

function buildDomain(service, options = {}) {
  if (!services.includes(service)) throw new Error('Expected one of: ' + services.join(', '));
  const root = fs.realpathSync(options.root || path.resolve(__dirname, '..'));
  const base = path.join(root, 'services', service);
  const output = path.join(base, 'dist');
  const scratch = path.join(base, 'build');
  assertLocalPath(root, output);
  assertLocalPath(root, scratch);
  fs.mkdirSync(scratch, { recursive: true });
  // Different services can build concurrently; the same service cannot publish
  // two builds at once. A failed compiler keeps the previous artifact intact.
  const lock = path.join(scratch, 'packaging.lock');
  const descriptor = fs.openSync(lock, 'wx');
  let staging;
  try {
    // A sibling of dist has the same depth: emitted relative source-map paths
    // remain valid when the completed artifact is published as dist.
    staging = fs.mkdtempSync(path.join(base, 'build-'));
    const args = [
      options.compiler || require.resolve('typescript/bin/tsc'),
      '-p', path.join(base, 'tsconfig.build.json'), '--outDir', staging,
    ];
    const result = (options.run || spawnSync)(process.execPath, args, {
      cwd: root, stdio: 'inherit', shell: false, windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Compilation failed for ' + service);

    const entrypoint = `src/apps/${service}/main.js`;
    if (!fs.existsSync(path.join(staging, entrypoint)))
      throw new Error('Missing service entrypoint: ' + entrypoint);
    const emitted = filesIn(staging);
    const otherMains = emitted.filter((file) =>
      /(?:^|\/)src\/apps\/[^/]+\/main\.js$/.test(file.replaceAll('\\', '/')) &&
      path.relative(staging, file).replaceAll('\\', '/') !== entrypoint);
    if (otherMains.length) throw new Error('Another service entrypoint was emitted');
    if (emitted.some((file) => /^(?:test|prisma)\/|\.spec\.js$/.test(path.relative(staging, file).replaceAll('\\', '/'))))
      throw new Error('Test or Prisma seed source was emitted');

    fs.mkdirSync(path.join(staging, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'database-safety.cjs'), path.join(staging, 'scripts', 'database-safety.cjs'));
    const files = Object.fromEntries(filesIn(staging).sort().map((file) => [
      path.relative(staging, file).replaceAll('\\', '/'),
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    ]));
    const manifest = { service, entrypoint, files };
    fs.writeFileSync(path.join(staging, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    // Both targets are derived from the fixed allowlist; never remove a source
    // directory, a sibling service's output or the legacy Backend/dist.
    assertLocalPath(root, output);
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(staging, output);
    staging = undefined;
    return manifest;
  } finally {
    if (staging) {
      assertLocalPath(root, staging);
      fs.rmSync(staging, { recursive: true, force: true });
    }
    fs.closeSync(descriptor);
    fs.unlinkSync(lock);
  }
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/build-domain.cjs <service>');
    const manifest = buildDomain(process.argv[2]);
    console.log(`${manifest.service}: ${Object.keys(manifest.files).length} files; entrypoint ${manifest.entrypoint}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildDomain, services };
