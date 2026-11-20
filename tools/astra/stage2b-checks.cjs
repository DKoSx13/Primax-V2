const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const h = require('./stage2b-lab.cjs');
function snapshot() {
  h.assertResources();
  const db = h.snapshot().find(x => x.service === 'postgres');
  assert(db && db.project === h.load().project && db.mounts.every(m => m.name.startsWith(db.project + '_')));
  const sql = `BEGIN READ ONLY;
SELECT json_build_object(
'migrations',(SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL),
'transactions',(SELECT count(*) FROM "Transaction"),
'payments',(SELECT count(*) FROM "Payment"),
'receipts',(SELECT count(*) FROM "Receipt"),
'duplicateTransactions',(SELECT count(*) FROM (SELECT "operationId" FROM "Transaction" GROUP BY 1 HAVING count(*)>1) x),
'pendingReservations',(SELECT count(*) FROM "InventoryReservation" WHERE status NOT IN ('CLOSED','CANCELLED')),
'openOperations',(SELECT count(*) FROM "TerminalOperation" WHERE status='ACTIVE'),
'orphanReceipts',(SELECT count(*) FROM "Receipt" r LEFT JOIN "Transaction" t ON t.id=r."transactionId" WHERE t.id IS NULL),
'inventory',(SELECT json_agg(x ORDER BY x."stationId",x."fuelId") FROM (SELECT "stationId","fuelId",liters::text,"reservedLiters"::text FROM "FuelInventory") x),
'financialDigest',(SELECT md5(string_agg(v,'' ORDER BY v)) FROM (
 SELECT row_to_json(t)::text v FROM "Transaction" t UNION ALL
 SELECT row_to_json(p)::text FROM "Payment" p UNION ALL
 SELECT row_to_json(r)::text FROM "Receipt" r UNION ALL
 SELECT row_to_json(w)::text FROM "WalletMovement" w UNION ALL
 SELECT row_to_json(m)::text FROM "InventoryMovement" m) rows),
'memberships',(SELECT json_agg(x ORDER BY x.id) FROM (SELECT id,number,"userId",status,balance::text FROM "Membership") x)
); COMMIT;`;
  return JSON.parse(h.compose(['exec', '-T', 'postgres', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'stage2b', '-d', 'stage2b_synthetic'], sql).trim());
}
async function extra(mode) {
  assert(['candidate', 'reference'].includes(mode));
  h.assertResources(); const state = h.load(), origin = 'http://127.0.0.1:' + state.ports[0];
  const results = []; let cookie;
  async function call(route, method = 'GET', body, headers = {}, expected = [200, 201]) {
    const r = await fetch(origin + '/api/v1' + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await r.json(); results.push({ route, method, status: r.status });
    assert(expected.includes(r.status), route + ': ' + r.status + ' ' + JSON.stringify(data));
    if (r.headers.getSetCookie().length) cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    return data;
  }
  const email = 'stage2b-' + randomUUID() + '@example.test';
  const body = { name: 'Synthetic Stage2B', email, password: state.values.DEMO_PASSWORD, passport: 'QA' + randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase() };
  const registered = await call('/auth/register', 'POST', body);
  assert(registered.accessToken && registered.user.id);
  await call('/auth/register', 'POST', body, {}, [409]);
  await call('/auth/login', 'POST', { email, password: 'SyntheticIncorrect123!' }, {}, [401]);
  const login = await call('/auth/login', 'POST', { email, password: body.password });
  assert.equal(login.user.id, registered.user.id);
  const auth = { Authorization: 'Bearer ' + login.accessToken };
  const membership = await call('/memberships/me', 'GET', undefined, auth);
  assert(membership); // Response envelope is frozen by the existing public API.
  await call('/control/dashboard', 'GET', undefined, auth, [401, 403]);
  await call('/vehicles', 'POST', { plate: 'ABC-123', label: 'Synthetic unauthorized link' }, auth, [409]);
  await call('/payments/webhook', 'POST', { eventId: randomUUID(), orderId: randomUUID(), type: 'PAID' }, {}, [401]);
  await call('/control/login', 'POST', { email: 'control-admin@primax.local', password: state.values.DEMO_CONTROL_ADMIN_PASSWORD });
  const admin = { Cookie: cookie };
  const stations = await call('/stations'), fuels = await call('/fuels');
  assert.deepEqual(fuels.map(f => f.pricePerGallon).sort(), ['21.3', '23.5', '26.2']);
  const input = { requestId: randomUUID(), stationId: stations.find(s => s.code === 'PRIMAX-SUR').id, fuelId: fuels.find(f => f.code === 'REGULAR').id, liters: '10.000000', reference: 'Synthetic Stage2B ' + mode };
  const receipt = await call('/control/inventory/receipts', 'POST', input, admin);
  const replay = await call('/control/inventory/receipts', 'POST', input, admin);
  assert.equal(receipt.movement.id, replay.movement.id); assert.equal(replay.replayed, true);
  await call('/control/inventory/receipts', 'POST', { ...input, liters: '11.000000' }, admin, [409]);
  await call('/control/catalog/inventory', 'GET', undefined, admin);
  await call('/control/audit', 'GET', undefined, admin);
  const result = { mode, passed: true, checks: results, syntheticRegisteredUserId: registered.user.id, inventoryMovementId: receipt.movement.id };
  fs.writeFileSync(path.join(h.folder, mode + '-extra.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ mode, requests: results.length, result: 'PASS' }));
}
if (require.main === module) {
  const mode = process.argv[2];
  if (mode === 'snapshot') console.log(JSON.stringify(snapshot(), null, 2));
  else extra(mode || 'candidate').catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { snapshot, extra };
