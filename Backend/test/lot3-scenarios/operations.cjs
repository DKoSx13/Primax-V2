module.exports = async c => {
  const { grants, sales, readSecurity } = require('./support.cjs');
  const { assert, call, db, id, snapshot, flags } = c, b = '/api/v1/control';
  await grants(c, ['ADMIN_OPERATION_VIEW', 'ADMIN_TERMINAL_VIEW', 'ADMIN_TERMINAL_MANAGE', 'ADMIN_AUDIT_VIEW']);
  await sales(c);
  await db.operationalAuditEvent.create({ data: { id: id('seed-audit'), eventKey: 'synthetic-audit', actorKind: 'USER', actorUserId: id('root'), stationId: id('station-A'), action: 'SYNTHETIC_CHECK', targetId: id('sale-A'), outcome: 'SUCCESS' } });
  const state = await snapshot();
  for (const [route, engine] of [['/operations', 'operations'], ['/operations/' + id('sale-operation-A'), 'operationDetail'], ['/terminals', 'terminals'], ['/audit', 'audit']]) {
    await readSecurity(c, b + route, route);
    await call('GET', b + route, 200, route + ' global', { engine: 'controlOperations.' + engine });
    await call('GET', b + route, 200, route + ' scoped', { actor: 'manager', engine: 'controlOperations.' + engine });
    await call('GET', b + route, 403, route + ' permission absent', { actor: 'viewer' });
  }
  const rows = await call('GET', b + '/operations?stationId=' + id('station-A') + '&mode=PREPAGO&from=2026-01-01&to=2026-02-01', 200, 'operation date station mode filters', { actor: 'manager' });
  assert(rows.some(x => x.operationId === id('sale-operation-A'))); assert(!rows.some(x => x.operationId === id('sale-operation-B')));
  await call('GET', b + '/operations?stationId=' + id('station-B'), 403, 'operations foreign station', { actor: 'manager' });
  await call('GET', b + '/operations/' + id('sale-operation-B'), 403, 'operation detail foreign station', { actor: 'manager' });
  await call('GET', b + '/operations/' + id('absent-operation'), 404, 'operation missing');
  await call('GET', b + '/operations?mode=BAD', 400, 'invalid operation mode DTO');
  await call('GET', b + '/operations?from=2026-02-01&to=2026-01-01', 400, 'reversed operation dates');
  await call('GET', b + '/terminals?stationId=' + id('station-B'), 403, 'terminals foreign station', { actor: 'manager' });
  await call('GET', b + '/audit?stationId=' + id('station-B'), 403, 'audit foreign station', { actor: 'manager' });
  const audit = await call('GET', b + '/audit?stationId=' + id('station-A') + '&action=SYNTHETIC&actorUserId=' + id('root'), 200, 'audit filters', { actor: 'manager' }); assert.equal(audit.length, 1);
  for (const [actor, status] of [['root', 409], ['manager', 409], ['viewer', 403], ['member', 403], ['anonymous', 401]])
    await call('POST', b + '/terminals/' + id('main-terminal') + '/status', status, 'terminal status retains rejection ' + actor, { actor, body: { action: 'SUSPEND', reason: 'Synthetic' } });
  await call('POST', b + '/terminals/' + id('main-terminal') + '/status', 400, 'terminal invalid status DTO', { body: { action: 'OTHER' } });
  assert.deepEqual(await snapshot(), state); assert.equal(await c.store.command('DBSIZE'), 0);
  flags.operationsFinancialProjectionsUnchanged = true; flags.terminalStatusRemainsReadOnly409 = true; flags.readsHaveNoWrites = true;
};
