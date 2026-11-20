import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import { Request } from 'express';
import { KioskService } from './kiosk.service';
import { KioskStore } from './redis-store';
import { PrismaService } from '../prisma/prisma.service';
import { kioskRoute } from './policy';

const stationId = '11111111-1111-4111-8111-111111111111';
const otherStation = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const key = randomBytes(32).toString('hex');
const password = 'fictional-operator-password';
const configValues = {
  APP_MODE: 'academic',
  KIOSK_GATEWAY_SECRET: key,
  KIOSK_STATION_ID: stationId,
  KIOSK_OPERATOR_USER: 'fixture-operator',
  KIOSK_OPERATOR_PASSWORD_HASH: hashSync(password, 12),
  KIOSK_SESSION_NAMESPACE: 'unit-test',
  KIOSK_SESSION_VERSION: '1',
};
// Test double only. Production uses Redis REST exclusively.
class SharedTestStore {
  data = new Map<string, string>();
  counts = new Map<string, number>();
  key(s: string) {
    return 'unit:' + s;
  }
  async command(command: string, ...args: (string | number)[]) {
    const k = String(args[0]);
    if (command === 'GET') return this.data.get(k) ?? null;
    if (command === 'DEL') return Number(this.data.delete(k));
    if (command === 'SET') {
      if (args.includes('NX') && this.data.has(k)) return null;
      this.data.set(k, String(args[1]));
      return 'OK';
    }
    if (command === 'EXPIRE') return Number(this.data.has(k));
    throw Error('Unexpected command');
  }
  async limit(scope: string, max: number) {
    const n = (this.counts.get(scope) || 0) + 1;
    this.counts.set(scope, n);
    return n <= max;
  }
}
function request(
  path: string,
  method = 'GET',
  body: unknown = null,
  token = '',
  csrf = '',
  timestamp = String(Date.now()),
) {
  const headers: Record<string, string> = {
    'x-kiosk-time': timestamp,
    'x-kiosk-session': token,
    'x-csrf-token': csrf,
  };
  headers['x-kiosk-signature'] = createHmac('sha256', key)
    .update(
      JSON.stringify([method, path, timestamp, body, token, csrf, '', '', '']),
    )
    .digest('hex');
  return {
    method,
    originalUrl: path,
    body,
    header: (name: string) => headers[name],
  } as unknown as Request;
}
function fixture() {
  const store = new SharedTestStore();
  const db = {
    station: {
      findUnique: jest.fn().mockResolvedValue({ id: stationId, active: true }),
    },
    fuelAuthorization: { findUnique: jest.fn().mockResolvedValue(null) },
    transaction: { findUnique: jest.fn().mockResolvedValue(null) },
    onlineOrder: { findUnique: jest.fn().mockResolvedValue(null) },
    payment: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const config = new ConfigService({ ...configValues });
  const instance = () =>
    new KioskService(
      config,
      store as unknown as KioskStore,
      db as unknown as PrismaService,
    );
  const a = instance(),
    b = instance();
  async function login() {
    const pre = (await a.status(request('/api/v1/kiosk/session'))) as {
      token: string;
      csrfToken: string;
    };
    return a.login(
      request(
        '/api/v1/kiosk/session/login',
        'POST',
        null,
        pre.token!,
        pre.csrfToken,
      ),
      { username: 'fixture-operator', password },
    );
  }
  return { a, b, store, db, config, login };
}
describe('operator security across independent function instances', () => {
  it.each(['cancel', 'demo-confirm', 'progress', 'release', 'intervention'])('binds ordinary %s to its operation before dispatch', async action => {
    const { a, db, login, store } = fixture();
    const session = await login();
    const terminalId = '44444444-4444-4444-8444-444444444444';
    const operation = { id, operationId: id, terminalId, stationId, pumpId: 'pump', terminalPumpAssignmentId: 'assignment', status: 'ACTIVE', closedAt: null };
    const findOperation = jest.fn().mockResolvedValue(operation);
    Object.assign(db, {
      terminalCredential: { findUnique: jest.fn().mockResolvedValue({
        terminalId, expiresAt: new Date(Date.now() + 60000), revokedAt: null,
        terminal: { id: terminalId, stationId, lifecycle: 'REGISTRADA', revokedAt: null },
      }) },
      terminalOperation: { findUnique: findOperation, findFirst: findOperation },
    });
    db.payment.findUnique.mockResolvedValue({ operationId: id });
    const auth = { ...operation, terminalOperationId: id, paymentId: id, mode: 'PREPAGO', status: 'RESERVED' };
    db.fuelAuthorization.findUnique.mockResolvedValue(auth);
    db.onlineOrder.findUnique.mockResolvedValue({ id, operationId: id, paymentId: id,
      status: 'PENDING', userId: null, transactionId: null });
    store.data.set(store.key('operation:' + id), stationId);
    const owner = '55555555-5555-4555-8555-555555555555';
    store.data.set(store.key('terminal-owner:' + terminalId), createHash('sha256').update(owner).digest('hex'));
    const technical = randomBytes(32).toString('hex');
    const req = request('/api/v1/kiosk/session/authorize', 'POST', {}, session.token, session.csrfToken);
    // Gateway authentication is covered separately. Exercise resource authorization in isolation.
    jest.spyOn(a, 'verifyGateway').mockImplementation(() => undefined);
    const headers = req.header.bind(req);
    Object.assign(req, { header: (name: string) => name === 'x-terminal-session' ? technical :
      name === 'x-terminal-owner' ? owner : headers(name) });
    const provider = jest.fn(), financialWrite = jest.fn();
    const resource = ['cancel', 'demo-confirm'].includes(action) ? 'online-orders' : 'authorizations';
    const dispatch = async () => {
      await a.authorize(req, { method: 'POST', path: '/api/v1/' + resource + '/' + id + '/' + action });
      provider();
      financialWrite();
    };
    findOperation.mockResolvedValue({ ...operation, terminalId: 'another-terminal' });
    await expect(dispatch()).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
    expect(financialWrite).not.toHaveBeenCalled();
    findOperation.mockResolvedValue(operation);
    db.payment.findUnique.mockResolvedValue({ operationId: 'other' });
    await expect(dispatch()).rejects.toThrow();
    db.payment.findUnique.mockResolvedValue({ operationId: id });
    if (resource === 'authorizations') {
      db.fuelAuthorization.findUnique.mockResolvedValue({ ...auth, terminalOperationId: 'older-operation' });
      await expect(dispatch()).rejects.toThrow();
      db.fuelAuthorization.findUnique.mockResolvedValue(auth);
    }
    expect(provider).not.toHaveBeenCalled();
    expect(financialWrite).not.toHaveBeenCalled();
    await dispatch();
    expect(provider).toHaveBeenCalledTimes(1);
    expect(financialWrite).toHaveBeenCalledTimes(1);
  });
  it('assigns one tab owner and refuses a competing tab while preserving financial attention', async () => {
    const { a, b, db, store } = fixture();
    const terminalId = '44444444-4444-4444-8444-444444444444';
    const operationId = '55555555-5555-4555-8555-555555555555';
    const first = '66666666-6666-4666-8666-666666666666';
    const second = '77777777-7777-4777-8777-777777777777';
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      terminalOperation: { findFirst: jest.fn().mockResolvedValue(null) },
      fuelAuthorization: { findFirst: jest.fn().mockResolvedValue(null) },
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
      payment: { findFirst: jest.fn().mockResolvedValue({ id }) },
      onlineOrder: { findFirst: jest.fn().mockResolvedValue(null) },
      inventoryReservation: { findFirst: jest.fn().mockResolvedValue(null) },
      operationalIncident: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    Object.assign(db, { atomic: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) });
    const tab = (value: string) => ({ header: (name: string) => name === 'x-terminal-owner' ? value : '' }) as Request;
    await expect(a.claimTerminal(tab(first), terminalId)).resolves.toMatchObject({ claimed: true });
    tx.terminalOperation.findFirst.mockResolvedValue({ operationId, id: operationId, terminalId, status: 'ACTIVE' });
    await expect(b.claimTerminal(tab(second), terminalId, operationId)).rejects.toThrow('ocupada');
    await expect(b.assertTerminalOwner(terminalId, second, true)).rejects.toThrow('ocupada');
    await expect(a.assertTerminalOwner(terminalId, first, true)).resolves.toBeUndefined();
    store.data.delete(store.key(`terminal-owner:${terminalId}`));
    await expect(b.claimTerminal(tab(second), terminalId, operationId)).rejects.toThrow('Operación activa');
  });
  it('reclaims only a closed recovery owner, never an active financial operation', async () => {
    const { a, db, store } = fixture();
    const terminalId = '44444444-4444-4444-8444-444444444444';
    const operationId = '55555555-5555-4555-8555-555555555555';
    const first = '66666666-6666-4666-8666-666666666666';
    const second = '77777777-7777-4777-8777-777777777777';
    const digestOwner = (owner: string) => createHash('sha256').update(owner).digest('hex');
    const recoveryHash = 'a'.repeat(64);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      terminalOperation: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ closedAt: new Date() }) },
    };
    Object.assign(db, { atomic: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) });
    const tab = (owner: string) => ({ header: (name: string) => name === 'x-terminal-owner' ? owner : '' }) as Request;
    store.data.set(store.key(`terminal-owner:${terminalId}`), digestOwner(first));
    store.data.set(store.key(`recovery-current:${terminalId}`), recoveryHash);
    store.data.set(store.key(`recovery-credential:${recoveryHash}`), JSON.stringify({ terminalId, operationId, owner: digestOwner(first) }));
    await expect(a.claimTerminal(tab(second), terminalId)).resolves.toMatchObject({ claimed: true });
    expect(store.data.get(store.key(`terminal-owner:${terminalId}`))).toBe(digestOwner(second));
    expect(store.data.has(store.key(`recovery-current:${terminalId}`))).toBe(false);
    store.data.set(store.key(`terminal-owner:${terminalId}`), digestOwner(first));
    store.data.set(store.key(`recovery-current:${terminalId}`), recoveryHash);
    tx.terminalOperation.findUnique.mockResolvedValue({ closedAt: null });
    await expect(a.claimTerminal(tab(second), terminalId)).rejects.toThrow('ocupada');
    tx.terminalOperation.findFirst.mockResolvedValue({ operationId, id: operationId, terminalId, status: 'ACTIVE' });
    await expect(a.claimTerminal(tab(second), terminalId)).rejects.toThrow('ocupada');
    Object.assign(db, { terminalOperation: { findUnique: jest.fn().mockResolvedValue({ terminalId, closedAt: new Date() }) } });
    await a.releaseClosedRecovery(terminalId, operationId, first);
    expect(store.data.has(store.key(`terminal-owner:${terminalId}`))).toBe(false);
  });
  it('rotates an existing terminal credential atomically during bootstrap', async () => {
    const { a, db } = fixture();
    const terminalId = '44444444-4444-4444-8444-444444444444';
    const tx = {
      terminal: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: terminalId, lifecycle: 'REGISTRADA', operationalStatus: 'DISPONIBLE' }) },
      terminalOperation: { findFirst: jest.fn().mockResolvedValue(null) },
      operationalAuditEvent: { create: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      terminalCredential: {
        findFirst: jest.fn().mockResolvedValue({ id }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id }),
        create: jest.fn().mockResolvedValue({ id: terminalId }),
      },
    };
    const atomic = jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx));
    Object.assign(db, {
      terminal: { findMany: jest.fn().mockResolvedValue([{ id: terminalId, operationalStatus: 'DISPONIBLE' }]) },
      terminalCredential: { findUnique: jest.fn().mockResolvedValue(null) },
      atomic,
    });
    const result = await a.bootstrapTerminal(request('/api/v1/kiosk/session/terminal-bootstrap', 'POST', {}));
    expect(result.terminalId).toBe(terminalId);
    expect(atomic).toHaveBeenCalledTimes(1);
    expect(tx.terminalCredential.updateMany).toHaveBeenCalledWith({ where: { terminalId, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(tx.terminalCredential.create).toHaveBeenCalledWith({ data: expect.objectContaining({ terminalId, rotatedFromId: id }) });
  });
  it('cannot use a plate check to claim an existing payment operation', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    db.onlineOrder.findUnique.mockResolvedValue({ id, operationId: id });
    await a.authorize(
      request(
        '/api/v1/admin/check-plate',
        'POST',
        { operationId: id },
        session.token,
        session.csrfToken,
      ),
    );
    await expect(
      a.authorize(
        request(
          '/api/v1/authorizations',
          'POST',
          { stationId, operationId: id },
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow();
  });
  it('rejects attaching a payment whose persisted station belongs to another terminal', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    db.payment.findUnique.mockResolvedValue({
      authorization: { stationId: otherStation },
    });
    await expect(
      a.authorize(
        request(
          '/api/v1/authorizations',
          'POST',
          { stationId, operationId: id },
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow('estación');
  });
  it('requires gateway proof, rejects modified body/path/session and stale signatures', () => {
    const { a } = fixture();
    for (const field of ['body', 'originalUrl', 'method']) {
      const req = request('/api/v1/fuels');
      Object.assign(req, {
        [field]: field === 'body' ? { changed: true } : 'changed',
      });
      expect(() => a.verifyGateway(req)).toThrow();
    }
    expect(() =>
      a.verifyGateway(
        request(
          '/api/v1/fuels',
          'GET',
          null,
          '',
          '',
          String(Date.now() - 31000),
        ),
      ),
    ).toThrow();
  });
  it('rotates preauth, shares authenticated sessions, checks CSRF and revokes on logout', async () => {
    const { a, b, login } = fixture();
    const session = await login();
    expect(
      (await b.session(session.token, session.csrfToken)).authenticated,
    ).toBe(true);
    await expect(b.session(session.token, 'wrong-csrf')).rejects.toThrow();
    await a.logout(
      request(
        '/api/v1/kiosk/session/logout',
        'POST',
        {},
        session.token,
        session.csrfToken,
      ),
    );
    await expect(b.session(session.token)).rejects.toThrow();
  });
  it('revokes sessions on credential version change and absolute expiry', async () => {
    const { a, b, login, config } = fixture();
    const session = await login();
    config.set('KIOSK_SESSION_VERSION', '2');
    await expect(b.session(session.token)).rejects.toThrow();
    config.set('KIOSK_SESSION_VERSION', '1');
    const now = jest.spyOn(Date, 'now').mockReturnValue(session.expiresAt + 1);
    try {
      await expect(a.session(session.token)).rejects.toThrow();
    } finally {
      now.mockRestore();
    }
  });
  it('shares login limits even when a client changes its claimed username', async () => {
    const { a, b } = fixture();
    const pre = (await a.status(request('/api/v1/kiosk/session'))) as {
      token: string;
      csrfToken: string;
    };
    for (let n = 0; n < 5; n++)
      await expect(
        a.login(
          request(
            '/api/v1/kiosk/session/login',
            'POST',
            null,
            pre.token!,
            pre.csrfToken,
          ),
          { username: String(n), password: 'wrong' },
        ),
      ).rejects.toThrow('Credenciales');
    await expect(
      b.login(
        request(
          '/api/v1/kiosk/session/login',
          'POST',
          null,
          pre.token!,
          pre.csrfToken,
        ),
        { username: 'fixture-operator', password },
      ),
    ).rejects.toThrow('Demasiados intentos');
    // Five real cost-12 bcrypt checks need headroom on a loaded laboratory host.
    // Keep every security assertion and the production rate limits unchanged.
  }, 60000);
  it('checks station and referenced authorization before any purchase can execute', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    const body = { stationId: otherStation, operationId: id };
    await expect(
      a.authorize(
        request(
          '/api/v1/transactions',
          'POST',
          body,
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow('estación');
    body.stationId = stationId;
    db.fuelAuthorization.findUnique.mockResolvedValue({
      stationId: otherStation,
    });
    await expect(
      a.authorize(
        request(
          '/api/v1/transactions',
          'POST',
          { ...body, authorizationId: id },
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow('estación');
  });
  it('denies access to existing online orders without a trusted operation binding', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    db.onlineOrder.findUnique.mockResolvedValue({ id, operationId: id });
    await expect(
      a.authorize(
        request(
          '/api/v1/online-orders/' + id,
          'GET',
          null,
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow();
    const body = {
      operationId: id,
      authorization: { operationId: id, stationId },
    };
    await expect(
      a.authorize(
        request(
          '/api/v1/online-orders',
          'POST',
          body,
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow();
  });
  it('rechecks resource station and denies admin/member/bulk endpoints', async () => {
    const { a, login, db } = fixture();
    const session = await login();
    db.transaction.findUnique.mockResolvedValue({ stationId: otherStation });
    await expect(
      a.authorize(
        request(
          '/api/v1/transactions/' + id,
          'GET',
          null,
          session.token,
          session.csrfToken,
        ),
      ),
    ).rejects.toThrow();
    for (const path of [
      '/api/v1/admin/dashboard',
      '/api/v1/memberships/me',
      '/api/v1/authorizations',
    ])
      expect(kioskRoute('GET', path)).toBe(false);
  });
  it('fails closed when shared storage is unavailable', async () => {
    const { a, store, login } = fixture();
    const session = await login();
    store.command = jest.fn().mockRejectedValue(Error('offline'));
    await expect(a.session(session.token)).rejects.toThrow();
  });
});
