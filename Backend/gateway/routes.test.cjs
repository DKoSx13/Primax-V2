const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serviceFor } = require('./routes.cjs');

for (const [path, service] of [
  ['/auth/login', 'identity'], ['/kiosk/session/authorize', 'identity'],
  ['/vehicles/ABC-123', 'identity'], ['/memberships/me', 'identity'],
  ['/memberships/me/transactions', 'identity'], ['/plate-recognition', 'identity'],
  ['/memberships/me/recharges', 'commerce'], ['/memberships/me/wallet', 'commerce'],
  ['/fuels/inventory', 'catalog'], ['/stations', 'catalog'], ['/benefits', 'catalog'],
  ['/transactions/123', 'commerce'], ['/authorizations/123/progress', 'commerce'],
  ['/online-orders/123/demo-confirm', 'commerce'], ['/rewards/redeem', 'commerce'],
  ['/control/payments/123/actions', 'commerce'], ['/control/assistance', 'commerce'],
  ['/control/terminal-operations/123/resolve', 'commerce'],
  ['/control/login', 'administration'], ['/control/receipts/123', 'administration'],
  ['/control/inventory/receipts', 'administration'], ['/inventory/123/456/reconcile', 'administration'],
]) test(path + ' preserves its owner', () => assert.equal(serviceFor('/api/v1' + path), service));

test('unknown namespaces and prefix collisions fail closed', () => {
  for (const path of ['/auth/login','/api/v1/fuels-private','/api/v1/controlx','/api/v2/auth'])
    assert.equal(serviceFor(path), undefined);
});
