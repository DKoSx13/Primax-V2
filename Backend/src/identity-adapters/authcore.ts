import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import type { UsersService } from '../users/users.service';
import type { PrismaClient } from '@prisma/client';
import { Identity } from '../identity-core/identity';
import { Grants, Revocations, Tokens } from '../identity-core/ports';

/** Uses the already configured AuthCore JWT service. Never creates/distributes a key. */
export class AuthCoreTokens implements Tokens {
  constructor(private readonly jwt: JwtService) {}
  sign(claims: { sub: string; ver: number }) {
    return this.jwt.signAsync(claims);
  }
  verify(token: string) {
    return this.jwt.verifyAsync(token);
  }
}

export class PrismaIdentityAccess implements Grants, Revocations {
  constructor(
    private readonly db: Pick<
      PrismaClient,
      | 'userPermissionGrant'
      | 'adminControlAccount'
      | 'adminControlGrant'
      | 'user'
    >,
  ) {}
  async forUser(userId: string) {
    const system = await this.db.userPermissionGrant.findFirst({
      where: { userId, permission: 'SYSTEM_ADMIN', revokedAt: null },
    });
    const account = await this.db.adminControlAccount.findUnique({
      where: { userId },
      include: {
        stations: {
          where: { endedAt: null, station: { active: true } },
          select: { stationId: true },
        },
      },
    });
    const grants = system
      ? []
      : await this.db.adminControlGrant.findMany({
          where: { userId, revokedAt: null },
        });
    return {
      systemAdmin: Boolean(system),
      approved: account?.status === 'APPROVED',
      emailVerified: Boolean(account?.emailVerifiedAt),
      role: account?.role ?? '',
      permissions: grants.map((grant) => grant.permission),
      stationIds: account?.stations.map((station) => station.stationId) ?? [],
    };
  }
  async incrementAuthVersion(userId: string) {
    await this.db.user.update({
      where: { id: userId },
      data: { authVersion: { increment: 1 } },
    });
  }
}

/** Opt-in composition for contract tests/future migration. Not registered in any module. */
export function identityUsingAuthCore(
  users: UsersService,
  jwt: JwtService,
  db: Pick<
    PrismaClient,
    'userPermissionGrant' | 'adminControlAccount' | 'adminControlGrant' | 'user'
  >,
) {
  const access = new PrismaIdentityAccess(db);
  const dummyHash = hash('invalid-account-timing-placeholder', 12);
  return new Identity({
    accounts: {
      byId: (id) => users.findById(id),
      byEmail: (email) => users.findByEmail(email),
      byDni: (dni) => users.findByDni(dni),
    },
    passwords: { compare },
    tokens: new AuthCoreTokens(jwt),
    grants: access,
    revocations: access,
    clock: { nowSeconds: () => Math.floor(Date.now() / 1000) },
    dummyPasswordHash: () => dummyHash,
  });
}
