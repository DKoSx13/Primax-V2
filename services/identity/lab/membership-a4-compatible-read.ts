import { MembershipReadError } from "./membership-a4-read";
import type { MembershipIdentityRead, MembershipIdentityView, TrustedMember } from "./membership-a4-read";
import type { CodeNormalization } from "../src/membership-codes/core";

export interface LegacyVehicle {
  readonly id: string;
  readonly membershipId: string;
  readonly plate: string;
  readonly label: string;
  readonly [field: string]: unknown;
}
export interface LegacyMembershipAnchor {
  readonly id: string;
  readonly userId: string;
  readonly number: string;
}
export interface LegacyMembershipBody extends LegacyMembershipAnchor {
  readonly status: "ACTIVE" | "SUSPENDED";
  readonly vehicles: readonly LegacyVehicle[];
  readonly balance: string;
  readonly pendingBalance: string;
  readonly reserved: string;
  readonly available: string;
  readonly total: string;
  readonly points: number;
  readonly [field: string]: unknown;
}
export interface VehiclePage { readonly page: number; readonly limit: number; }
/** Wire-shaped values from existing providers. No write, financial calculation or HTTP port. */
export interface LegacyCompatibleReadProvider {
  anchor(userId: string): Promise<LegacyMembershipAnchor | null>;
  me(userId: string): Promise<LegacyMembershipBody>;
  vehicles(userId: string, page: VehiclePage): Promise<readonly LegacyVehicle[]>;
}
export type MembershipSelector = { readonly kind: "user"; readonly userId?: string } |
  { readonly kind: "membership"; readonly membershipId: string } |
  { readonly kind: "code"; readonly code: unknown; readonly normalization: CodeNormalization };
export interface CompatibleRead<T> {
  readonly identity: MembershipIdentityView;
  readonly body: T;
  readonly provider: "LEGACY_SYNTHETIC";
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const fail = (code: "INVALID_INPUT" | "BINDING_MISMATCH" | "INVALID_UPSTREAM_RESPONSE"): never => { throw new MembershipReadError(code); };
function immutable<T>(value: T): T {
  if (value && typeof value === "object") { for (const item of Object.values(value)) immutable(item); Object.freeze(value); }
  return value;
}
/** Private in-process composition only. The legacy body remains authoritative and unchanged.
 * Snapshots of two providers are NOT one distributed snapshot; no retry/cache/fallback.
 */
export class PrivateCompatibleMembershipReads {
  constructor(private readonly identity: MembershipIdentityRead, private readonly legacy: LegacyCompatibleReadProvider,
    options: { readonly synthetic: true }) {
    if (options?.synthetic !== true) fail("INVALID_INPUT");
  }
  async #resolve(actor: TrustedMember, selector: MembershipSelector): Promise<MembershipIdentityView> {
    if (!selector) fail("INVALID_INPUT");
    switch (selector.kind) {
      case "user": return this.identity.forUser(actor, selector.userId);
      case "membership": return this.identity.byMembershipId(actor, selector.membershipId);
      case "code": return this.identity.resolveCode(actor, selector.code, selector.normalization);
      default: return fail("INVALID_INPUT");
    }
  }
  async #provider<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      // Preserve only the explicit adapter error contract, never upstream text.
      if (error instanceof MembershipReadError && ["NOT_FOUND", "DENIED", "UNAVAILABLE"].includes(error.code)) throw error;
      throw new MembershipReadError("UNAVAILABLE");
    }
  }
  #anchor(value: LegacyMembershipAnchor, identity: MembershipIdentityView, actor: TrustedMember): void {
    if (!value || !uuid(value.id) || !uuid(value.userId) || typeof value.number !== "string") fail("INVALID_UPSTREAM_RESPONSE");
    if (value.id !== identity.membershipId || value.userId !== actor.userId || value.number !== identity.canonicalNumber)
      fail("BINDING_MISMATCH");
  }
  async #authorized(actor: TrustedMember, selector: MembershipSelector): Promise<MembershipIdentityView> {
    const identity = await this.#resolve(actor, selector);
    const anchor = await this.#provider(() => this.legacy.anchor(actor.userId));
    if (anchor === null) throw new MembershipReadError("NOT_PROVISIONED");
    this.#anchor(anchor, identity, actor);
    return identity;
  }
  #vehicles(value: readonly LegacyVehicle[], membershipId: string): void {
    if (!Array.isArray(value)) fail("INVALID_UPSTREAM_RESPONSE");
    const ids = new Set<string>();
    for (const row of value) {
      if (!row || !uuid(row.id) || !uuid(row.membershipId) || typeof row.plate !== "string" ||
          typeof row.label !== "string" || ids.has(row.id)) fail("INVALID_UPSTREAM_RESPONSE");
      if (row.membershipId !== membershipId) fail("BINDING_MISMATCH");
      ids.add(row.id);
    }
  }
  async me(actor: TrustedMember, selector: MembershipSelector = { kind: "user" }): Promise<CompatibleRead<LegacyMembershipBody>> {
    const identity = await this.#authorized(actor, selector);
    const body = await this.#provider(() => this.legacy.me(actor.userId));
    this.#anchor(body, identity, actor);
    if (!["ACTIVE", "SUSPENDED"].includes(body.status) || !Number.isSafeInteger(body.points)) fail("INVALID_UPSTREAM_RESPONSE");
    for (const key of ["balance", "pendingBalance", "reserved", "available", "total"] as const)
      if (typeof body[key] !== "string" || !/^-?\d+\.\d{2}$/.test(body[key])) fail("INVALID_UPSTREAM_RESPONSE");
    this.#vehicles(body.vehicles, identity.membershipId);
    return immutable({ identity, body: structuredClone(body), provider: "LEGACY_SYNTHETIC" as const });
  }
  async vehicles(actor: TrustedMember, page: VehiclePage,
    selector: MembershipSelector = { kind: "user" }): Promise<CompatibleRead<readonly LegacyVehicle[]>> {
    if (!page || !Number.isSafeInteger(page.page) || page.page < 1 || !Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > 100)
      fail("INVALID_INPUT");
    const identity = await this.#authorized(actor, selector);
    const body = await this.#provider(() => this.legacy.vehicles(actor.userId, { page: page.page, limit: page.limit }));
    this.#vehicles(body, identity.membershipId);
    if (body.length > page.limit) fail("INVALID_UPSTREAM_RESPONSE");
    return immutable({ identity, body: structuredClone(body), provider: "LEGACY_SYNTHETIC" as const });
  }
}
