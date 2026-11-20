exports.grants = async (c, permissions, who = 'manager') => {
  for (const permission of permissions) await c.db.adminControlGrant.upsert({
    where: { id: c.id(who + '-' + permission) },
    create: { id: c.id(who + '-' + permission), userId: c.id(who), permission, reason: 'Synthetic' },
    update: { revokedAt: null },
  });
};
exports.incident = (c, key, station = 'A') => c.db.operationalIncident.create({ data: {
  id: c.id('incident-' + key), eventKey: 'synthetic-incident-' + key, code: 'OPERATION_REVIEW',
  stationId: c.id('station-' + station), summary: 'Synthetic incident ' + key,
} });
exports.sales = async c => {
  for (const station of ['A', 'B']) await c.db.transaction.create({ data: {
    id: c.id('sale-' + station), operationId: c.id('sale-operation-' + station),
    requestHash: c.digest('sale-' + station), stationId: c.id('station-' + station),
    fuelId: c.id('fuel'), membershipId: c.id('member-membership'), vehicleId: c.id('member-vehicle'),
    plate: 'AAA-001', amount: '20.00', unitPrice: '20.00', gallons: '1.000',
    pointsRate: '0.0100', pointsEarned: 0, mode: 'PREPAGO', createdAt: new Date('2026-01-15T12:00:00Z'),
  } });
};
exports.readSecurity = async (c, route, label) => {
  for (const [actor, status] of [['anonymous', 401], ['invalid', 401], ['expired', 401], ['stale', 401], ['member', 403], ['legacy', 401], ['signed', 403]])
    await c.call('GET', route, status, label + ' rejects ' + actor, { actor });
};
