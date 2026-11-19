// Fresh synthetic pending DEMO records exercise recovery without contacting a provider.
module.exports = async c => {
  await require('./lot2-scenarios/kiosk.cjs')(c);
  const { assert, db, store, id, digest, technical, terminals, kiosk, call, rollback, flags } = c;
  const actor = { kind: 'control', userId: id('root'), global: true, role: 'SUPER_ADMIN',
    permissions: ['ADMIN_TERMINAL_MANAGE', 'ADMIN_INCIDENT_MANAGE'], stationIds: [] };
  async function fixture(key) {
    const terminal = terminals[key], operationId = id('recovery-' + key);
    const operation = await db.terminalOperation.create({ data: {
      id: id('recovery-row-' + key), operationId, stationId: terminal.stationId, terminalId: terminal.terminalId,
      pumpId: terminal.pumpId, terminalPumpAssignmentId: id(key + '-assignment'),
    } });
    await db.terminalCredential.updateMany({ where: { terminalId: terminal.terminalId }, data: { issuedAt: new Date('2019-01-01'), expiresAt: new Date('2020-01-01') } });
    const payment = await db.payment.create({ data: { id: id('recovery-payment-' + key), operationId, method: 'YAPE', status: 'PENDING', amount: '12.00', provider: 'DEMO' } });
    const orderId = id('recovery-order-' + key);
    await db.onlineOrder.create({ data: { id: orderId, operationId, requestHash: digest(technical(key)), paymentId: payment.id,
      method: 'YAPE', amount: '12.00', providerId: 'demo:' + orderId, status: 'PENDING' } });
    await db.inventoryReservation.create({ data: { id: id('recovery-reservation-' + key), operationId,
      terminalOperationId: operation.id, stationId: terminal.stationId, fuelId: id('fuel'), source: 'TERMINAL',
      status: 'PENDING_PAYMENT', maxGallons: '1.000', initialLiters: '3.785400', remainingLiters: '3.785400', requestHash: digest(technical(key)) } });
    await db.fuelInventory.update({ where: { stationId_fuelId: { stationId: terminal.stationId, fuelId: id('fuel') } }, data: { reservedLiters: { increment: '3.785400' } } });
    await db.paymentEvent.create({ data: { id: id('recovery-event-' + key), eventKey: 'demo-intent:' + orderId,
      orderId, paymentId: payment.id, kind: 'DEMO_PENDING', detail: JSON.stringify({ id: 'demo:' + orderId,
        order_number: orderId, amount: 1200, currency_code: 'PEN', state: 'pending' }) } });
    const grant = await kiosk.issueRecoveryTicket(actor, operationId, 'Synthetic browser session lost');
    return { terminal, operationId, grant };
  }
  const exchange = (item, status, label, extra = {}) => call('POST', '/api/v1/kiosk/session/terminal-recovery', status, label,
    { actor: 'signed', engine: 'kiosk.exchangeRecoveryTicket', owner: id('recovery-browser-owner'),
      body: { ticket: item.grant.ticket, terminalCode: 'T-' + item.terminal.key.toUpperCase() }, ...extra });
  const valid = await fixture('ticket');
  await exchange(valid, 409, 'recovery rejects another terminal code', { body: { ticket: valid.grant.ticket, terminalCode: 'T-OTHER' } });
  await db.userPermissionGrant.update({ where: { id: id('root-grant') }, data: { revokedAt: new Date() } });
  await exchange(valid, 403, 'recovery rechecks revoked administrative grant');
  await db.userPermissionGrant.update({ where: { id: id('root-grant') }, data: { revokedAt: null } });
  const result = await exchange(valid, 201, 'valid recovery exchanges once with real SQL and Redis');
  assert.equal(result.operationId, valid.operationId); assert.equal(result.evidence.kind, 'PENDING_PAYMENT');
  assert.match(result.terminalToken, /^[a-f0-9]{64}$/);
  assert(Date.parse(result.terminalExpiresAt) > Date.now() + 14 * 60_000);
  assert(Date.parse(result.terminalExpiresAt) <= Date.now() + 15 * 60_000);
  assert.equal((await kiosk.recoveryCredential(result.terminalToken, id('recovery-browser-owner'))).terminalId, valid.terminal.terminalId);
  await assert.rejects(kiosk.recoveryCredential(result.terminalToken, id('different-browser-owner')));
  await exchange(valid, 401, 'successful recovery ticket cannot replay');
  assert.equal(await db.operationalAuditEvent.count({ where: { targetId: id('recovery-row-ticket'), action: 'TERMINAL_RECOVERY_GRANTED', outcome: 'SUCCESS' } }), 1);
  assert.equal(await db.terminalCredential.count({ where: { terminalId: valid.terminal.terminalId, revokedAt: null } }), 0);
  const expired = await fixture('blocked');
  await store.command('PEXPIRE', store.key('recovery-ticket:' + digest(expired.grant.ticket)), 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  await exchange(expired, 401, 'recovery ticket expires in real Redis');
  const failed = await fixture('rollback');
  const prior = await db.terminalCredential.findMany({ where: { terminalId: failed.terminal.terminalId } });
  rollback(true);
  await exchange(failed, 500, 'recovery SQL rollback retains original cross-store semantics');
  rollback(false);
  assert.deepEqual(await db.terminalCredential.findMany({ where: { terminalId: failed.terminal.terminalId } }), prior);
  assert.equal(await store.command('GET', store.key('recovery-ticket:' + digest(failed.grant.ticket))), null);
  await exchange(failed, 401, 'consumed recovery ticket after SQL rollback is not retried');
  assert.equal(await db.transaction.count(), 0); assert.equal(await db.receipt.count(), 0);
  assert.equal(await db.payment.count({ where: { status: 'PENDING', provider: 'DEMO' } }), 3);
  delete flags.noKioskBoundaryClaimed; delete flags.validRecoveryExchangeCoveredOnlyByHistoricalUnitEvidence;
  flags.realSqlRedisRecoveryExchange = true; flags.originalCrossStoreRollbackLimitationPreserved = true;
};
