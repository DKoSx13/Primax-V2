const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..'), id = crypto.randomBytes(6).toString('hex');
const dir = path.join(repo, '.cache/astra-lot2c-identity/images-' + id);
fs.mkdirSync(dir, { recursive: true });
const results = [];
function run(args, name) {
  const r = spawnSync('docker', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  fs.writeFileSync(path.join(dir, name + '.log'), (r.stdout || '') + (r.stderr || ''));
  assert.equal(r.status, 0, 'Docker failed: ' + name + '; inspect private log');
  return r.stdout;
}
for (const domain of ['identity', 'catalog', 'administration', 'commerce', 'legacy']) {
  const tag = `primax-astra-lot2c-${domain}:${id}`;
  const dockerfile = domain === 'legacy' ? 'Backend/Dockerfile' : `Backend/services/${domain}/Dockerfile`;
  run(['build', '--progress', 'plain', '-f', dockerfile, '-t', tag, 'Backend'], domain + '-build');
  const image = JSON.parse(run(['image', 'inspect', tag], domain + '-inspect'))[0];
  assert.equal(image.Config.User, 'node');
  const smoke = run(['run', '--rm', '--network', 'none', '--read-only',
    '--mount', `type=bind,source=${path.join(__dirname, 'lot2c-image-bootstrap.cjs')},target=/bootstrap.cjs,readonly`,
    '--entrypoint', 'node', tag, '/bootstrap.cjs', domain], domain + '-bootstrap');
  results.push({ domain, tag, imageId: image.Id, user: image.Config.User, command: image.Config.Cmd, bootstrap: JSON.parse(smoke.trim()) });
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(domain + ': image built and intercepted bootstrap passed');
}
console.log('Evidence: ' + path.relative(repo, dir));
