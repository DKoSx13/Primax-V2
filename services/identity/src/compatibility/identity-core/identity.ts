import {
  Actor,
  Claims,
  IdentityError,
  SYSTEM_CONTROL_PERMISSIONS,
} from './domain';
import {
  Accounts,
  Clock,
  CommerceMemberships,
  Grants,
  Memberships,
  Passwords,
  Revocations,
  Sessions,
  Tokens,
} from './ports';

export class Identity {
  constructor(
    private readonly ports: {
      accounts: Accounts;
      passwords: Passwords;
      tokens: Tokens;
      clock: Clock;
      grants: Grants;
      revocations: Revocations;
      dummyPasswordHash: () => Promise<string>;
    },
  ) {}

  async login(input: {
    email?: string;
    identifier?: string;
    password: string;
  }) {
    if (input.email && input.identifier)
      throw new IdentityError('invalid-input', 'Usa un solo identificador');
    const identifier = (input.identifier ?? input.email ?? '')
      .trim()
      .toLowerCase();
    const user = /^\d{8}$/.test(identifier)
      ? await this.ports.accounts.byDni(identifier)
      : await this.ports.accounts.byEmail(identifier);
    const valid = await this.ports.passwords.compare(
      input.password,
      user?.passwordHash ?? (await this.ports.dummyPasswordHash()),
    );
    if (!user?.active || !valid)
      throw new IdentityError(
        'unauthorized',
        'Correo, DNI o contraseña incorrectos',
      );
    return {
      accessToken: await this.ports.tokens.sign({
        sub: user.id,
        ver: user.authVersion ?? 0,
      }),
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  async authenticate(
    token: string,
    access: 'member' | 'control' = 'member',
  ): Promise<{
    contractVersion: 1;
    actor: Actor;
    authVersion: number;
    expiresAt?: number;
  }> {
    let claims: Claims;
    try {
      claims = await this.ports.tokens.verify(token);
    } catch {
      throw new IdentityError('unauthorized', 'Token inválido o vencido');
    }
    if (
      !claims ||
      typeof claims.sub !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(claims.sub) ||
      (claims.exp !== undefined &&
        (!Number.isFinite(claims.exp) ||
          claims.exp <= this.ports.clock.nowSeconds()))
    )
      throw new IdentityError('unauthorized', 'Token inválido o vencido');
    const user = await this.ports.accounts.byId(claims.sub);
    if (!user?.active)
      throw new IdentityError(
        access === 'control' ? 'unauthorized' : 'forbidden',
        access === 'control'
          ? 'Sesión administrativa vencida'
          : 'Usuario inactivo',
      );
    if ((claims.ver ?? 0) !== user.authVersion)
      throw new IdentityError(
        'unauthorized',
        'Sesión invalidada. Inicia sesión nuevamente.',
      );
    let actor: Actor = { kind: 'member', userId: user.id };
    if (access === 'control') {
      const grants = await this.ports.grants.forUser(user.id);
      if (!grants.systemAdmin && (!grants.approved || !grants.emailVerified))
        throw new IdentityError(
          'forbidden',
          'Acceso a Primax Control no autorizado',
        );
      if (
        !grants.systemAdmin &&
        !grants.permissions.includes('ADMIN_CONTROL_ACCESS')
      )
        throw new IdentityError(
          'forbidden',
          'Se requiere acceso a Primax Control',
        );
      actor = {
        kind: 'control',
        userId: user.id,
        role: grants.systemAdmin ? 'SUPER_ADMIN' : grants.role,
        permissions: grants.systemAdmin
          ? [...SYSTEM_CONTROL_PERMISSIONS]
          : [...grants.permissions],
        stationIds: grants.systemAdmin ? [] : [...grants.stationIds],
        global: grants.systemAdmin,
      };
    }
    return {
      contractVersion: 1,
      actor,
      authVersion: user.authVersion,
      expiresAt: claims.exp,
    };
  }

  revokeAll(userId: string) {
    return this.ports.revocations.incrementAuthVersion(userId);
  }
}

/** Route-specific policy: Control authentication itself historically permits no stations. */
export function requireControlPermission(
  actor: Actor,
  permission: string,
  stationId?: string,
) {
  if (
    actor.kind !== 'control' ||
    !actor.permissions.includes(permission) ||
    (!actor.global &&
      (actor.stationIds.length === 0 ||
        (stationId !== undefined && !actor.stationIds.includes(stationId))))
  )
    throw new IdentityError('forbidden', 'Permiso o estación no autorizado');
}

export class IdentitySessions {
  constructor(
    private readonly sessions: Sessions,
    private readonly clock: Clock,
  ) {}
  /** Signature, CSRF and request binding remain responsibilities of KioskService. */
  async resolveVerifiedKioskSession(id: string): Promise<Actor> {
    const session = await this.sessions.find(id);
    if (
      !session?.stationId ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= this.clock.nowSeconds()
    )
      throw new IdentityError('unauthorized', 'Sesión inválida o vencida');
    return { kind: 'kiosk', stationId: session.stationId };
  }
  revoke(id: string) {
    return this.sessions.revoke(id);
  }
}

export class MembershipOverview {
  constructor(
    private readonly memberships: Memberships,
    private readonly commerce: CommerceMemberships,
  ) {}
  async forUser(userId: string) {
    const profile = await this.memberships.forUser(userId);
    if (!profile)
      throw new IdentityError('not-found', 'Membresía no encontrada');
    return { profile, finance: await this.commerce.summary(profile.id) };
  }
}
