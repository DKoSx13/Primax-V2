// Ordered compatibility contract. Specific membership/control routes precede prefixes.
const routes = [
  [/^\/api\/v1\/demo-print\/jobs\/receipt-[a-zA-Z0-9-]{1,100}$/, 'print'],
  [/^\/api\/v1\/memberships\/me\/(?:wallet|recharges)(?:\/|$)/, 'commerce'],
  [/^\/api\/v1\/control\/(?:payments|terminal-operations|assistance)(?:\/|$)/, 'commerce'],
  [/^\/api\/v1\/(?:auth|admin|kiosk|memberships|vehicles|plate-recognition)(?:\/|$)/, 'identity'],
  [/^\/api\/v1\/(?:fuels|stations|benefits)(?:\/|$)/, 'catalog'],
  [/^\/api\/v1\/(?:transactions|authorizations|online-orders|payments|rewards|terminal|operational-admin)(?:\/|$)/, 'commerce'],
  [/^\/api\/v1\/(?:control|inventory)(?:\/|$)/, 'administration'],
];
function serviceFor(path) { return routes.find(([pattern]) => pattern.test(path))?.[1]; }
module.exports = { serviceFor };
