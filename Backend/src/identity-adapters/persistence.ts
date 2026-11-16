import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  Accounts,
  Memberships,
  Sessions,
  Vehicles,
} from '../identity-core/ports';

/** Explicit queries; no Nest bootstrap, shared UsersService or financial columns. */
export class PrismaIdentityAccounts implements Accounts {
  constructor(private readonly db: Pick<PrismaClient, 'user' | 'membership'>) {}
  byId(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }
  byEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }
  async byDni(dni: string) {
    const membership = await this.db.membership.findUnique({
      where: { dni },
      include: { user: true },
    });
    return membership?.user ?? null;
  }
}

export class PrismaMembershipProfiles implements Memberships {
  constructor(private readonly db: Pick<PrismaClient, 'membership'>) {}
  async forUser(userId: string) {
    const row = await this.db.membership.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        number: true,
        status: true,
        user: { select: { name: true, email: true } },
      },
    });
    return row
      ? {
          id: row.id,
          userId: row.userId,
          number: row.number,
          status: row.status,
          ...row.user,
        }
      : null;
  }
}

/** Delegates the existing atomic ownership transaction; no duplicate linking rules. */
export class LegacyVehicleLinks implements Vehicles {
  constructor(
    private readonly repository: {
      link(userId: string, plate: string, label: string): Promise<unknown>;
    },
  ) {}
  async link(userId: string, plate: string, label: string) {
    await this.repository.link(userId, plate, label);
  }
}

/** Internal port only. Caller must authorize signature/CSRF before resolving/revoking.
 * Legacy wire format uses milliseconds; Identity uses epoch seconds.
 */
export class RedisVerifiedKioskSessions implements Sessions {
  constructor(
    private readonly redis: {
      get(key: string): Promise<string | null>;
      del(key: string): Promise<number>;
    },
    private readonly policy: {
      namespace: string;
      stationId: string;
      version: string;
    },
  ) {}
  private key(id: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(id))
      throw new Error('Invalid opaque session');
    return `primax:v12:${this.policy.namespace}:session:${createHash('sha256').update(id).digest('hex')}`;
  }
  async find(id: string) {
    const raw = await this.redis.get(this.key(id));
    if (!raw) return null;
    let row: {
      authenticated?: boolean;
      stationId?: string;
      version?: string;
      expiresAt?: number;
    };
    try {
      row = JSON.parse(raw);
    } catch {
      return null;
    }
    if (
      !row ||
      row.authenticated !== true ||
      row.version !== this.policy.version ||
      row.stationId !== this.policy.stationId ||
      typeof row.expiresAt !== 'number' ||
      !Number.isFinite(row.expiresAt)
    )
      return null;
    return { stationId: row.stationId, expiresAt: row.expiresAt / 1000 };
  }
  async revoke(id: string) {
    await this.redis.del(this.key(id));
  }
}
