import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { AccessGuard } from '../auth/access.guard';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { KioskService } from '../kiosk/kiosk.service';
import { Actor } from '../identity-core/domain';
import { identityUsingAuthCore } from './authcore';

describe('Identity / AuthCore compatibility (synthetic persistence, real JWT/bcrypt)', () => {
  const jwt = new JwtService({
    secret: 'synthetic-mission5-key-never-used-outside-tests',
    signOptions: {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'primax-v6',
      audience: 'primax-prime',
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer: 'primax-v6',
      audience: 'primax-prime',
    },
  });
  const id = '11111111-1111-4111-8111-111111111111';
  let user: {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    active: boolean;
    authVersion: number;
  };
  let permissions: string[];
  let systemAdmin: boolean;
  let unavailable: boolean;
  const users = {
    findByEmail: async (email: string) => (email === user.email ? user : null),
    findByDni: async (dni: string) => (dni === '12345678' ? user : null),
    findById: async () => {
      if (unavailable) throw Error('synthetic database unavailable');
      return user;
    },
  } as unknown as UsersService;
  const queries = {
    userPermissionGrant: {
      findFirst: jest.fn(async () => (systemAdmin ? { id: 'grant' } : null)),
    },
    adminControlAccount: {
      findUnique: jest.fn(async () => ({
        status: 'APPROVED',
        emailVerifiedAt: new Date(),
        role: 'ENCARGADO',
        stations: [{ stationId: 'A' }],
      })),
    },
    adminControlGrant: {
      findMany: jest.fn(async () =>
        permissions.map((permission) => ({ permission })),
      ),
    },
    user: {
      update: jest.fn(async () => {
        user.authVersion++;
      }),
    },
  };
  const db = queries as unknown as PrismaService;
  const core = identityUsingAuthCore(users, jwt, db);
  const legacy = new AuthService(users, jwt);
  async function throughGuard(
    token: string,
    access = 'member',
  ): Promise<Actor> {
    const req: {
      headers: object;
      header: (name: string) => string | undefined;
      actor?: Actor;
    } = {
      headers: {},
      header: (name) =>
        name === 'authorization' ? `Bearer ${token}` : undefined,
    };
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const reflector = {
      getAllAndOverride: () => access,
    } as unknown as Reflector;
    const guard = new AccessGuard(
      reflector,
      new ConfigService(),
      jwt,
      users,
      {} as KioskService,
      db,
    );
    await guard.canActivate(context);
    return req.actor!;
  }
  beforeEach(async () => {
    user = {
      id,
      email: 'synthetic@example.invalid',
      name: 'Synthetic',
      passwordHash: await hash('FixtureOnly123!', 12),
      active: true,
      authVersion: 0,
    };
    permissions = ['ADMIN_CONTROL_ACCESS', 'ADMIN_INVENTORY_VIEW'];
    systemAdmin = false;
    unavailable = false;
  });
  it('legacy login JWT authenticates in core; core JWT authenticates in unchanged AccessGuard', async () => {
    const old = await legacy.login({
      email: user.email,
      password: 'FixtureOnly123!',
    });
    const fresh = await core.login({
      identifier: '12345678',
      password: 'FixtureOnly123!',
    });
    expect({ ...fresh, accessToken: undefined }).toEqual({
      ...old,
      accessToken: undefined,
    });
    expect((await core.authenticate(old.accessToken)).actor).toEqual({
      kind: 'member',
      userId: id,
    });
    expect(await throughGuard(fresh.accessToken)).toEqual({
      kind: 'member',
      userId: id,
    });
    const claims = await jwt.verifyAsync(fresh.accessToken);
    expect(claims).toMatchObject({
      sub: id,
      ver: 0,
      iss: 'primax-v6',
      aud: 'primax-prime',
    });
    expect(claims.exp - claims.iat).toBe(3600);
  });
  it.each(['tampered', 'expired', 'issuer', 'audience', 'algorithm'])(
    'both validators reject %s JWT',
    async (mode) => {
      const valid = await jwt.signAsync({ sub: id, ver: 0 });
      const token =
        mode === 'tampered'
          ? valid.split('.').slice(0, 2).join('.') + '.invalid'
          : await jwt.signAsync(
              { sub: id, ver: 0 },
              mode === 'expired'
                ? { expiresIn: -1 }
                : mode === 'issuer'
                  ? { issuer: 'other' }
                  : mode === 'audience'
                    ? { audience: 'other' }
                    : { algorithm: 'HS384' },
            );
      await expect(core.authenticate(token)).rejects.toMatchObject({
        code: 'unauthorized',
      });
      await expect(throughGuard(token)).rejects.toMatchObject({ status: 401 });
    },
  );
  it('atomic version increment invalidates tokens in both validators', async () => {
    const token = await jwt.signAsync({ sub: id, ver: 0 });
    await core.revokeAll(id);
    expect(queries.user.update).toHaveBeenCalledWith({
      where: { id },
      data: { authVersion: { increment: 1 } },
    });
    await expect(core.authenticate(token)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(throughGuard(token)).rejects.toMatchObject({ status: 401 });
  });
  it('Control actor and live grant revocation match AccessGuard exactly', async () => {
    const token = await jwt.signAsync({ sub: id, ver: 0 }, { expiresIn: '8h' });
    expect((await core.authenticate(token, 'control')).actor).toEqual(
      await throughGuard(token, 'control'),
    );
    expect(queries.adminControlAccount.findUnique).toHaveBeenCalledWith({
      where: { userId: id },
      include: {
        stations: {
          where: { endedAt: null, station: { active: true } },
          select: { stationId: true },
        },
      },
    });
    expect(queries.adminControlGrant.findMany).toHaveBeenCalledWith({
      where: { userId: id, revokedAt: null },
    });
    permissions = [];
    await expect(core.authenticate(token, 'control')).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(throughGuard(token, 'control')).rejects.toMatchObject({
      status: 403,
    });
  });
  it('SYSTEM_ADMIN permission list is identical to existing guard', async () => {
    systemAdmin = true;
    const token = await jwt.signAsync({ sub: id, ver: 0 });
    expect((await core.authenticate(token, 'control')).actor).toEqual(
      await throughGuard(token, 'control'),
    );
  });
  it('persistence outage fails closed in both validators', async () => {
    const token = await jwt.signAsync({ sub: id, ver: 0 });
    unavailable = true;
    await expect(core.authenticate(token)).rejects.toThrow('unavailable');
    await expect(throughGuard(token)).rejects.toThrow('unavailable');
  });
});
