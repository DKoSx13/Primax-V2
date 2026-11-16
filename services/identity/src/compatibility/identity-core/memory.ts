import { Account, ControlAccess, MembershipProfile } from './domain';
import { Accounts, Grants, Memberships, Revocations, Sessions } from './ports';

/** Synthetic fixtures only. No production fallback or persistent secrets. */
export class MemoryIdentity implements Accounts, Grants, Revocations, Sessions {
  readonly accounts = new Map<string, Account>();
  readonly grants = new Map<string, ControlAccess>();
  readonly sessions = new Map<
    string,
    { stationId: string; expiresAt: number }
  >();
  readonly memberships = new Map<string, MembershipProfile>();
  async byId(id: string) {
    return this.accounts.get(id) ?? null;
  }
  async byEmail(email: string) {
    return [...this.accounts.values()].find((u) => u.email === email) ?? null;
  }
  readonly dni = new Map<string, string>();
  async byDni(dni: string) {
    return this.byId(this.dni.get(dni) ?? '');
  }
  async forUser(userId: string): Promise<ControlAccess> {
    return (
      this.grants.get(userId) ?? {
        systemAdmin: false,
        approved: false,
        emailVerified: false,
        role: '',
        permissions: [],
        stationIds: [],
      }
    );
  }
  // Memberships uses a separate view because forUser also names the grants query.
  readonly membershipProfiles: Memberships = {
    forUser: async (userId) => this.memberships.get(userId) ?? null,
  };
  async incrementAuthVersion(userId: string) {
    const user = this.accounts.get(userId);
    if (!user) throw new Error('Unknown synthetic account');
    user.authVersion += 1;
  }
  async find(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async revoke(id: string) {
    this.sessions.delete(id);
  }
}
