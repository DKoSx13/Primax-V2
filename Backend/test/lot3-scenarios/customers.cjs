module.exports = async c => {
  const { grants, sales, readSecurity } = require('./support.cjs');
  const { assert, call, id, snapshot, flags } = c, b = '/api/v1/control';
  await grants(c, ['ADMIN_CUSTOMER_VIEW', 'ADMIN_MEMBERSHIP_VIEW', 'ADMIN_VEHICLE_VIEW', 'ADMIN_TRANSACTION_VIEW', 'ADMIN_RECEIPT_VIEW']); await sales(c);
  const state = await snapshot(), seq = await c.sequences();
  const endpoints = [['/customers', 'customers'], ['/memberships', 'memberships'], ['/vehicles', 'vehicles'], ['/customers/' + id('member'), 'customer'], ['/memberships/' + id('member-membership'), 'membership'], ['/transactions/' + id('sale-A'), 'transaction'], ['/receipts/' + id('sale-A'), 'receipt'], ['/transactions', 'transactions']];
  for (const [route, engine] of endpoints) {
    await readSecurity(c, b + route, route);
    await call('GET', b + route, 200, route + ' root', { engine: 'customers.' + engine });
    await call('GET', b + route, 200, route + ' scoped', { actor: 'manager', engine: 'customers.' + engine });
    await call('GET', b + route, 403, route + ' permission absent', { actor: 'viewer' });
  }
  const history = await call('GET', b + '/transactions?stationId=' + id('station-A') + '&mode=PREPAGO&from=2026-01-15&to=2026-01-15', 200, 'transaction Lima-day filters', { actor: 'manager', engine: 'customers.transactions' });
  assert.equal(history.length, 1); assert.equal(history[0].operationId, id('sale-operation-A'));
  await call('GET', b + '/transactions?stationId=' + id('station-B'), 403, 'transaction list foreign station', { actor: 'manager' });
  await call('GET', b + '/transactions/' + id('sale-B'), 403, 'transaction detail foreign station', { actor: 'manager' });
  await call('GET', b + '/receipts/' + id('sale-B'), 403, 'receipt foreign station', { actor: 'manager' });
  await call('GET', b + '/transactions?from=2026-02-01&to=2026-01-01', 400, 'transaction invalid date range');
  await call('GET', b + '/transactions?mode=BAD', 400, 'transaction invalid query DTO');
  await call('GET', b + '/customers/' + id('absent'), 404, 'customer absent');
  await call('GET', b + '/memberships/' + id('absent'), 404, 'membership absent');
  await call('GET', b + '/transactions/' + id('absent'), 404, 'transaction absent');
  await call('GET', b + '/receipts/bad', 400, 'receipt invalid UUID');
  assert.deepEqual(await snapshot(), state); assert.deepEqual(await c.sequences(), seq); assert.equal(await c.store.command('DBSIZE'), 0);
  flags.previousSevenAndRemainingTransactionRead = true; flags.noFinancialOrIdentityWrites = true;
};
