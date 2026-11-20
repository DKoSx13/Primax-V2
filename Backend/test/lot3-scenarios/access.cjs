module.exports = async c => {
  const { assert, call, db, config, snapshot, seedPassword, id, flags } = c, b = '/api/v1/control';
  const post = (route, status, label, body, options = {}) => call('POST', b + route, status, label, { actor: 'anonymous', body, ...options });
  const request = { email: 'request@synthetic.invalid', name: 'Synthetic request', password: seedPassword, role: 'ENCARGADO' };
  const before = await snapshot();
  await post('/access-requests', 503, 'disabled request delivery', request, { engine: 'control.requestAccess' });
  await post('/resend-verification', 503, 'disabled resend delivery', { email: request.email }, { engine: 'control.resendVerification' });
  await post('/verify-email', 400, 'invalid verification token', { token: 'x'.repeat(32) }, { engine: 'control.verifyEmail' });
  await post('/access-requests', 400, 'invalid request DTO', { ...request, role: 'SUPER_ADMIN' }, { engine: 'control.requestAccess', noEngine: true });
  for (const [who, password, status] of [['root', 'bad', 401], ['missing', seedPassword, 401], ['member', seedPassword, 403], ['inactive', seedPassword, 401]])
    await post('/login', status, 'control login ' + who, { email: who + '@synthetic.invalid', password }, { engine: 'control.login' });
  for (const mode of ['local', 'production']) {
    config.set('APP_MODE', mode); let loginCookie;
    const context = await post('/login', 200, 'control login cookie ' + mode, { email: 'root@synthetic.invalid', password: seedPassword }, {
      engine: 'control.login', capture: r => { loginCookie = r.headers['set-cookie'][0]; },
    });
    assert.equal(context.global, true); assert.equal(context.user.id, id('root'));
    assert.equal(loginCookie.includes('; Secure'), mode !== 'local');
    assert(loginCookie.includes('HttpOnly') && loginCookie.includes('SameSite=Strict') && loginCookie.includes('Path=/api/v1/control'));
    await call('GET', b + '/session', 200, 'cookie session ' + mode, { actor: 'anonymous', headers: { Cookie: loginCookie.split(';')[0] }, engine: 'control.session' });
    let cleared;
    await call('POST', b + '/logout', 200, 'logout cookie ' + mode, { actor: 'root', capture: r => { cleared = r.headers['set-cookie'][0]; } });
    assert.equal(cleared.includes('; Secure'), mode !== 'local'); assert(cleared.includes('HttpOnly') && cleared.includes('SameSite=Strict'));
  }
  config.set('APP_MODE', 'local');
  await require('./support.cjs').readSecurity(c, b + '/session', 'session');
  await call('GET', b + '/session', 200, 'manager scoped session', { actor: 'manager', engine: 'control.session' });
  await call('POST', b + '/logout', 401, 'anonymous logout', { actor: 'anonymous' });
  assert.deepEqual(await snapshot(), before); assert.equal(await c.store.command('DBSIZE'), 0);
  config.set('PASSWORD_RESET_DELIVERY', 'smtp');
  const deliveries = c.verificationDeliveries;
  await post('/access-requests', 201, 'request access original transaction', request, { engine: 'control.requestAccess' });
  c.passwords.set(request.email, seedPassword);
  const user = await db.user.findUniqueOrThrow({ where: { email: request.email } });
  assert.equal(await db.membership.count({ where: { userId: user.id } }), 0);
  assert.equal((await db.adminControlAccount.findUniqueOrThrow({ where: { userId: user.id } })).status, 'PENDING_EMAIL');
  await post('/access-requests', 409, 'request duplicate email', request, { engine: 'control.requestAccess' });
  const first = deliveries.get(request.email).token;
  await post('/resend-verification', 200, 'resend replaces token', { email: request.email }, { engine: 'control.resendVerification' });
  await post('/verify-email', 400, 'superseded verification', { token: first }, { engine: 'control.verifyEmail' });
  let token = deliveries.get(request.email).token;
  let state = await snapshot(); c.rollback(true);
  await post('/verify-email', 500, 'verification rollback', { token }, { engine: 'control.verifyEmail' });
  c.rollback(false); assert.deepEqual(await snapshot(), state);
  await post('/verify-email', 200, 'verify original token', { token }, { engine: 'control.verifyEmail' });
  await post('/verify-email', 400, 'verification replay', { token }, { engine: 'control.verifyEmail' });
  await post('/login', 403, 'pending approval login denied', { email: request.email, password: seedPassword }, { engine: 'control.login' });
  await post('/resend-verification', 200, 'verified resend hides existence', { email: request.email }, { engine: 'control.resendVerification' });
  await post('/resend-verification', 200, 'missing resend hides existence', { email: 'absent@synthetic.invalid' }, { engine: 'control.resendVerification' });
  state = await snapshot(); c.rollback(true);
  await post('/access-requests', 500, 'request rollback', { ...request, email: 'rollback@synthetic.invalid' }, { engine: 'control.requestAccess' });
  c.rollback(false); assert.deepEqual(await snapshot(), state); assert(!deliveries.has('rollback@synthetic.invalid'));
  await post('/access-requests', 201, 'request for expiry', { ...request, email: 'expired@synthetic.invalid' }, { engine: 'control.requestAccess' });
  c.passwords.set('expired@synthetic.invalid', seedPassword);
  const expired = await db.user.findUniqueOrThrow({ where: { email: 'expired@synthetic.invalid' } });
  await db.adminEmailVerification.update({ where: { userId: expired.id }, data: { expiresAt: new Date('2020-01-01') } });
  await post('/verify-email', 400, 'expired verification', { token: deliveries.get(expired.email).token }, { engine: 'control.verifyEmail' });
  flags.originalAccessCookieAndVerification = true; flags.noMembershipWriterCreated = true;
};
