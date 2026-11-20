const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function guardFixture({ contents = {}, markers = {} } = {}) {
  const writes = [], ownership = [];
  const kind = p => p.replaceAll('\\', '/').split('/')[2];
  const fakeFs = {
    existsSync: p => Object.hasOwn(markers, kind(p)),
    readFileSync: p => JSON.stringify(markers[kind(p)]),
    lstatSync: () => ({ isSymbolicLink: () => false }),
    readdirSync: p => contents[p.split('/')[2]] || [],
    writeFileSync: (...args) => writes.push(args),
    chownSync: (...args) => ownership.push(args),
  };
  return { writes, ownership, run: () => vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'compose-volume-guard.cjs'), 'utf8'), {
    require: name => name === 'node:fs' ? fakeFs : require(name),
    process: { env: { COMPOSE_PROJECT_NAME: 'primax-astra-original' } }, console: { log() {} },
  }) };
}
test('claims four empty volumes before any application initialization', () => {
  const f = guardFixture(); f.run(); assert.equal(f.writes.length, 4); assert.equal(f.ownership.length, 2);
  for (const [, payload] of f.writes) assert.equal(JSON.parse(payload).project, 'primax-astra-original');
});
test('unknown nonempty PostgreSQL volume refuses all claims', () => {
  const f = guardFixture({ contents: { postgres: ['PG_VERSION'] } });
  assert.throws(f.run, /Nonempty unowned volume refused/); assert.equal(f.writes.length, 0);
});
test('unknown print data refuses claims even if the first volumes are empty', () => {
  const f = guardFixture({ contents: { print: ['receipt-existing.json'] } });
  assert.throws(f.run, /Nonempty unowned volume refused/); assert.equal(f.writes.length, 0);
});
test('marker from a different project is never accepted', () => {
  const f = guardFixture({ markers: { postgres: { project: 'another-project', kind: 'postgres', purpose: 'primax-astra-original-synthetic-v1' } } });
  assert.throws(f.run, /Unknown volume owner/); assert.equal(f.writes.length, 0);
});
test('owned persistent volumes are checked without recreating markers', () => {
  const kinds = ['postgres', 'redis', 'print', 'bootstrap'];
  const markers = Object.fromEntries(kinds.map(kind => [kind, { project: 'primax-astra-original', kind, purpose: 'primax-astra-original-synthetic-v1' }]));
  const f = guardFixture({ contents: Object.fromEntries(kinds.map(k => [k, ['existing-data']])), markers });
  f.run(); assert.equal(f.writes.length, 0);
});
