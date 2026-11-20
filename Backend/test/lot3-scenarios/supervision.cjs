module.exports = async c => {
  const { grants, incident, readSecurity } = require('./support.cjs');
  const { assert, call, db, id, snapshot, flags } = c, b = '/api/v1/control';
  await grants(c, ['ADMIN_DASHBOARD_VIEW']);
  await incident(c, 'main'); await incident(c, 'other', 'B'); await incident(c, 'rollback');
  let state = await snapshot();
  for (const [route, engine] of [['/dashboard', 'dashboard'], ['/incidents?stationId=' + id('station-A'), 'incidents'], ['/incidents/' + id('incident-main'), 'incident']]) {
    await readSecurity(c, b + route, route);
    await call('GET', b + route, 200, route + ' root', { engine: 'control.' + engine });
    await call('GET', b + route, 200, route + ' assigned staff', { actor: 'manager', engine: 'control.' + engine });
  }
  await call('GET', b + '/dashboard?stationId=' + id('station-B'), 403, 'dashboard foreign station', { actor: 'manager' });
  await call('GET', b + '/dashboard', 403, 'dashboard permission absent', { actor: 'viewer' });
  await call('GET', b + '/incidents?stationId=' + id('station-B'), 403, 'incident list foreign station', { actor: 'manager' });
  await call('GET', b + '/incidents/' + id('incident-other'), 403, 'incident detail foreign station', { actor: 'manager' });
  await call('GET', b + '/incidents/' + id('absent'), 404, 'incident not found');
  await call('GET', b + '/incidents?stationId=bad', 400, 'incident station DTO');
  await call('GET', b + '/incidents?stationId=' + id('station-A') + '&status=OPEN', 200, 'incident status filter');
  assert.deepEqual(await snapshot(), state);
  const update = (key, status, label, next, options = {}) => call('POST', b + '/incidents/' + id('incident-' + key) + '/status', status, label, { body: { status: next, reason: 'Synthetic reason' }, engine: 'control.incidentStatus', ...options });
  await update('main', 403, 'incident manage permission absent', 'IN_REVIEW', { actor: 'viewer' });
  await update('other', 403, 'incident manage foreign station', 'IN_REVIEW', { actor: 'manager' });
  await update('main', 409, 'cannot resolve directly from OPEN', 'RESOLVED');
  state = await snapshot(); c.rollback(true); await update('rollback', 500, 'incident transition audit rollback', 'IN_REVIEW'); c.rollback(false); assert.deepEqual(await snapshot(), state);
  await update('main', 201, 'incident OPEN to IN_REVIEW', 'IN_REVIEW', { actor: 'manager' });
  state = await snapshot(); await update('main', 201, 'same incident status no extra audit', 'IN_REVIEW'); assert.deepEqual(await snapshot(), state);
  await update('main', 201, 'incident IN_REVIEW to RESOLVED', 'RESOLVED');
  const row = await db.operationalIncident.findUniqueOrThrow({ where: { id: id('incident-main') } }); assert.equal(row.resolvedByUserId, id('root')); assert(row.resolvedAt);
  await update('main', 409, 'terminal incident cannot reopen', 'IN_REVIEW');
  await update('rollback', 201, 'incident dismissal', 'DISMISSED');
  assert.equal(await c.store.command('DBSIZE'), 0); flags.incidentTransitionsAtomicAuditAndScope = true;
};
