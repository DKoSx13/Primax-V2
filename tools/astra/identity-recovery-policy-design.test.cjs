// Executable specification only. No HTTP, database, production imports or crypto.
const test = require('node:test');
const assert = require('node:assert/strict');
function model() {
  const s = { admin: true, revision: 1, version: 0, token: true, password: 'old', permit: null, receipt: null, online: true, terminal: false };
  return { s,
    reserve(binding) {
      if (!s.online) throw Error('UNAVAILABLE');
      if (s.permit) { assert.deepEqual(binding, s.permit.binding); return s.permit; }
      s.permit = { binding: structuredClone(binding), revision: s.revision, mode: s.admin ? 'ADMIN_BASE' : 'PRIME', expires: 10 };
      return s.permit;
    },
    changeRole() { if (s.permit && !s.terminal) return 'PENDING'; s.admin = false; s.revision++; return 'APPLIED'; },
    commit(binding, now, fail = false) {
      if (s.receipt) { assert.deepEqual(binding, s.receipt); return 'RECEIPT'; }
      if (!s.online) throw Error('UNAVAILABLE');
      assert.ok(s.permit && !s.terminal);
      assert.deepEqual(binding, s.permit.binding);
      assert.ok(now < s.permit.expires && s.token && binding.version === s.version);
      const candidate = { password: 'new', version: s.version + 1, token: false, receipt: structuredClone(binding) };
      if (fail) throw Error('ROLLBACK');
      Object.assign(s, candidate); return 'COMMITTED';
    },
    // Local terminal abort must fence subsequent commits before authority releases.
    abort() { assert.equal(s.receipt, null); s.terminal = true; },
    acknowledge() { assert.ok(s.receipt || s.terminal); s.terminal = true; }
  };
}
const binding = () => ({ account: 'synthetic-A', reset: 'synthetic-reset', operation: 'synthetic-operation', version: 0, fingerprint: 'synthetic-keyed-binding' });
test('original classification truth table: Control OR SYSTEM_ADMIN; otherwise Prime', () => {
  for (const control of [false,true]) for (const system of [false,true])
    assert.equal(control || system ? 'ADMIN_BASE' : 'PRIME', !control && !system ? 'PRIME' : 'ADMIN_BASE');
});
test('TTL alone admits a stale decision: explicit counterexample', () => {
  const m=model(); const p=m.reserve(binding()); m.s.admin=false; m.s.revision++; // bypassing the required gate
  assert.ok(1 < p.expires); assert.equal(p.mode,'ADMIN_BASE'); assert.equal(m.s.admin,false);
});
test('role mutation ordered before reservation changes policy', () => {
  const m=model(); assert.equal(m.changeRole(),'APPLIED'); assert.equal(m.reserve(binding()).mode,'PRIME');
});
test('reservation before revocation blocks completion until durable outcome', () => {
  const m=model(), b=binding(); m.reserve(b); assert.equal(m.changeRole(),'PENDING');
  assert.equal(m.commit(b,1),'COMMITTED'); assert.equal(m.changeRole(),'PENDING');
  m.acknowledge(); assert.equal(m.changeRole(),'APPLIED');
});
test('lost response and two retries recover one receipt without incrementing twice', () => {
  const m=model(), b=binding(); assert.deepEqual(m.reserve(b),m.reserve(b)); m.commit(b,1);
  assert.equal(m.commit(b,2),'RECEIPT'); assert.equal(m.commit(b,3),'RECEIPT'); assert.equal(m.s.version,1); assert.equal(m.s.token,false);
});
test('binding manipulation and changed authVersion reject before writes', () => {
  for (const field of ['account','reset','operation','fingerprint']) {
    const m=model(),b=binding();m.reserve(b);assert.throws(()=>m.commit({...b,[field]:'other'},1));assert.equal(m.s.password,'old');
  }
  const m=model(),b=binding();m.reserve(b);m.s.version++;assert.throws(()=>m.commit(b,1));assert.equal(m.s.token,true);
});
test('authority outage and expiry fail closed; expiry does not release pending reservation', () => {
  const m=model();m.s.online=false;assert.throws(()=>m.reserve(binding()),/UNAVAILABLE/);assert.equal(m.s.permit,null);
  m.s.online=true;m.reserve(binding());assert.throws(()=>m.commit(binding(),10));assert.equal(m.changeRole(),'PENDING');
  m.abort();assert.equal(m.changeRole(),'APPLIED');assert.throws(()=>m.commit(binding(),11));
});
test('local rollback preserves password, version, token and receipt together', () => {
  const m=model(),b=binding();m.reserve(b);assert.throws(()=>m.commit(b,1,true),/ROLLBACK/);
  assert.equal(m.s.password,'old');assert.equal(m.s.version,0);assert.equal(m.s.token,true);assert.equal(m.s.receipt,null);
});
