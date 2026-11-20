import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { AdminAccessEngine } from '../auth/admin-access.engine';
import { AdminAccessOperations } from '../../services/identity/src/application/use-cases/admin-access-operations';
import { AdminAccessOperationsAdapter } from '../../services/identity/src/adapters/inbound/admin-access-operations.adapter';
import { ExistingAdminAccessOperations } from '../../services/identity/src/adapters/outbound/existing-admin-access-operations';
import { composeAdminAccessOperations } from '../../services/identity/src/bootstrap/admin-access-operations.composition';

describe('Lot 2D original admin access boundary', () => {
  it('delegates once with the identical DTO, promise, result and error', async () => {
    const result = { accessToken: 'synthetic' }, dto = { username: 'test', password: 'synthetic' };
    const promise = Promise.resolve(result);
    const engine = { login: jest.fn(() => promise), demo: jest.fn(() => ({ enabled: false })) };
    const boundary = new AdminAccessOperationsAdapter(new AdminAccessOperations(new ExistingAdminAccessOperations(engine as unknown as AdminAccessEngine)));
    expect(boundary.login(dto)).toBe(promise);
    expect(await promise).toBe(result);
    expect(engine.login).toHaveBeenCalledTimes(1);
    expect(engine.login).toHaveBeenCalledWith(dto);
    const demo = boundary.demo(); expect(demo).toEqual({ enabled: false }); expect(engine.demo).toHaveBeenCalledTimes(1);
    const error = new Error('original'); engine.login.mockImplementation(() => Promise.reject(error));
    await expect(boundary.login(dto)).rejects.toBe(error); expect(engine.login).toHaveBeenCalledTimes(2);
  });
  it.each(['production', 'staging', 'test', '', undefined])('never discloses or accepts demo credentials in APP_MODE=%s', async mode => {
    const config = new ConfigService({ APP_MODE: mode, SHOW_DEMO_ADMIN_CREDENTIALS: 'true', DEMO_ADMIN_USER: 'demo', DEMO_ADMIN_PASSWORD: 'synthetic', ADMIN_USER: 'admin', ADMIN_PASSWORD_HASH: await hash('admin-secret', 4) });
    const jwt = new JwtService({ secret: 'synthetic-test-only' });
    const boundary = composeAdminAccessOperations(config, jwt);
    expect(boundary.demo()).toEqual({ enabled: false });
    await expect(boundary.login({ username: 'demo', password: 'synthetic' })).rejects.toThrow('Credenciales incorrectas');
    const { accessToken } = await boundary.login({ username: 'admin', password: 'admin-secret' });
    const claims = jwt.verify(accessToken); expect(claims.sub).toBe('admin'); expect(claims.role).toBe('admin'); expect(claims.adminUser).toBe('admin'); expect(claims.exp - claims.iat).toBe(1800);
  });
  it.each(['false', '', undefined, 'TRUE'])('requires the exact explicit local flag %s', flag => {
    expect(composeAdminAccessOperations(new ConfigService({ APP_MODE: 'local', SHOW_DEMO_ADMIN_CREDENTIALS: flag }), new JwtService()).demo()).toEqual({ enabled: false });
  });
  it('retains local demo mode and the injected signing instance', async () => {
    const config = new ConfigService({ APP_MODE: 'local', SHOW_DEMO_ADMIN_CREDENTIALS: 'true', DEMO_ADMIN_USER: 'demo', DEMO_ADMIN_PASSWORD: 'synthetic' });
    const jwt = new JwtService({ secret: 'synthetic-test-only' }), sign = jest.spyOn(jwt, 'signAsync');
    const boundary = composeAdminAccessOperations(config, jwt);
    expect(boundary.demo()).toEqual({ enabled: true, username: 'demo', password: 'synthetic' });
    await boundary.login({ username: 'demo', password: 'synthetic' });
    expect(sign).toHaveBeenCalledTimes(1); expect(sign).toHaveBeenCalledWith({ sub: 'admin', role: 'admin', adminUser: 'demo' }, { expiresIn: '30m' });
    await expect(boundary.login({ username: 'demo', password: 'bad' })).rejects.toThrow('Credenciales incorrectas');
    expect(sign).toHaveBeenCalledTimes(1);
  });
});
