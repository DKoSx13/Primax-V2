import type { CodeNormalization } from "../src/membership-codes/core";

export type ReadErrorCode = "INVALID_INPUT" | "DENIED" | "NOT_FOUND" |
  "NOT_PROVISIONED" | "BINDING_MISMATCH" | "UNAVAILABLE" | "INVALID_UPSTREAM_RESPONSE";
export class MembershipReadError extends Error {
  readonly code: ReadErrorCode;
  constructor(code: ReadErrorCode) { super(code); this.name = "MembershipReadError"; this.code = code; }
}
export interface TrustedMember { readonly kind: "member"; readonly userId: string; }
export interface IdentityBinding {
  readonly userId: string;
  readonly accountId: string;
  readonly membershipId: string | null;
}
export interface IdentityBindingRead { forUser(userId: string): IdentityBinding | null; }
export interface PersistedMembershipIdentity {
  readonly membershipId: string;
  readonly accountId: string;
  readonly canonicalNumber: string;
  readonly legacyNumbers: readonly string[];
}
export interface ResolvedMembershipIdentity extends PersistedMembershipIdentity {
  readonly matchedBy: "CANONICAL" | "ALIAS";
  readonly matchedCode: string;
}
export interface MembershipReadSession {
  byMembershipId(id: string): Promise<PersistedMembershipIdentity | null>;
  byAccountId(id: string): Promise<PersistedMembershipIdentity | null>;
  resolveCode(code: string, mode: CodeNormalization): Promise<ResolvedMembershipIdentity | null>;
}
export interface MembershipIdentityRepository {
  snapshot<T>(work: (session: MembershipReadSession) => Promise<T>): Promise<T>;
}
export interface ReadMetadata {
  readonly source: "A4";
  readonly sourceDatasetId: string;
  readonly schemaVersion: 1;
  readonly observedAt: string;
}
export interface MembershipIdentityView extends PersistedMembershipIdentity {
  readonly contractVersion: 1;
  readonly provenance: ReadMetadata;
}
export interface MembershipResolutionView extends MembershipIdentityView {
  readonly matchedBy: "CANONICAL" | "ALIAS";
  readonly matchedCode: string;
}
export interface MembershipIdentityRead {
  forUser(actor: TrustedMember, userId?: string): Promise<MembershipIdentityView>;
  byMembershipId(actor: TrustedMember, id: string): Promise<MembershipIdentityView>;
  resolveCode(actor: TrustedMember, code: unknown, normalization: CodeNormalization): Promise<MembershipResolutionView>;
  aliasesForMember(actor: TrustedMember, id: string): Promise<readonly string[]>;
}
type CodeCore = Pick<typeof import("../src/membership-codes/core"), "normalizeMembershipCode" | "isCanonicalMembershipNumber">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
function failure(code: ReadErrorCode): never { throw new MembershipReadError(code); }

/** Immutable synthetic manifest, not an authority over operational users/accounts. */
export class SyntheticIdentityBindings implements IdentityBindingRead {
  #users = new Map<string, IdentityBinding>();
  constructor(entries: readonly IdentityBinding[]) {
    const accounts = new Set<string>(), memberships = new Set<string>();
    if (!Array.isArray(entries)) failure("INVALID_INPUT");
    for (const entry of entries) {
      if (!entry || Object.keys(entry).sort().join(",") !== "accountId,membershipId,userId" ||
          !validId(entry.userId) || !validId(entry.accountId) ||
          (entry.membershipId !== null && !validId(entry.membershipId))) failure("INVALID_INPUT");
      if (this.#users.has(entry.userId) || accounts.has(entry.accountId) ||
          (entry.membershipId !== null && memberships.has(entry.membershipId))) failure("BINDING_MISMATCH");
      accounts.add(entry.accountId);
      if (entry.membershipId !== null) memberships.add(entry.membershipId);
      this.#users.set(entry.userId, Object.freeze({ ...entry }));
    }
  }
  forUser(userId: string): IdentityBinding | null { return this.#users.get(userId) ?? null; }
}

/** Application boundary for trusted, already verified members in a private lab.
 * No HTTP/JWT verifier, Control support, financial projection or writable port.
 */
export class PrivateMembershipReads implements MembershipIdentityRead {
  #repository: MembershipIdentityRepository;
  #bindings: IdentityBindingRead;
  #core: CodeCore;
  #dataset: string;
  #clock: () => string;
  constructor(repository: MembershipIdentityRepository, bindings: IdentityBindingRead, core: CodeCore,
    options: { synthetic: true; sourceDatasetId: string; clock?: () => string }) {
    if (options?.synthetic !== true || !/^[a-z0-9][a-z0-9-]{3,80}$/.test(options.sourceDatasetId)) failure("INVALID_INPUT");
    this.#repository = repository; this.#bindings = bindings; this.#core = core;
    this.#dataset = options.sourceDatasetId; this.#clock = options.clock ?? (() => new Date().toISOString());
  }
  #owner(actor: TrustedMember): IdentityBinding {
    if (!actor || actor.kind !== "member" || !validId(actor.userId)) failure("DENIED");
    let binding: IdentityBinding | null;
    try { binding = this.#bindings.forUser(actor.userId); }
    catch { failure("UNAVAILABLE"); }
    if (!binding) failure("NOT_PROVISIONED");
    if (binding.userId !== actor.userId || !validId(binding.accountId) ||
        (binding.membershipId !== null && !validId(binding.membershipId))) failure("BINDING_MISMATCH");
    return binding;
  }
  async #read<T>(work: (session: MembershipReadSession) => Promise<T>): Promise<T> {
    try { return await this.#repository.snapshot(work); }
    catch (error) {
      if (error instanceof MembershipReadError) throw error;
      // Never expose SQL, URLs, raw upstream bodies or internal IDs in errors.
      throw new MembershipReadError("UNAVAILABLE");
    }
  }
  #view(row: PersistedMembershipIdentity, binding: IdentityBinding): MembershipIdentityView {
    if (!row || !validId(row.membershipId) || !validId(row.accountId) ||
        !this.#core.isCanonicalMembershipNumber(row.canonicalNumber) || row.canonicalNumber.length > 30 ||
        !Array.isArray(row.legacyNumbers) || new Set(row.legacyNumbers).size !== row.legacyNumbers.length ||
        row.legacyNumbers.some((code) => this.#core.normalizeMembershipCode(code, "exact") !== code) ||
        row.legacyNumbers.includes(row.canonicalNumber)) failure("INVALID_UPSTREAM_RESPONSE");
    if (row.membershipId !== binding.membershipId || row.accountId !== binding.accountId) failure("BINDING_MISMATCH");
    const observedAt = this.#clock();
    if (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt)) ||
        new Date(observedAt).toISOString() !== observedAt) failure("INVALID_UPSTREAM_RESPONSE");
    return Object.freeze({
      contractVersion: 1, membershipId: row.membershipId, accountId: row.accountId,
      canonicalNumber: row.canonicalNumber, legacyNumbers: Object.freeze([...row.legacyNumbers]),
      provenance: Object.freeze({ source: "A4", sourceDatasetId: this.#dataset, schemaVersion: 1, observedAt }),
    });
  }
  async forUser(actor: TrustedMember, userId?: string): Promise<MembershipIdentityView> {
    const binding = this.#owner(actor);
    const target = userId ?? actor.userId;
    if (!validId(target)) failure("INVALID_INPUT");
    if (target !== actor.userId) failure("DENIED");
    if (binding.membershipId === null) failure("NOT_FOUND");
    return this.#read(async (session) => {
      const row = await session.byAccountId(binding.accountId);
      if (!row) failure("NOT_PROVISIONED");
      return this.#view(row, binding);
    });
  }
  async byMembershipId(actor: TrustedMember, id: string): Promise<MembershipIdentityView> {
    const binding = this.#owner(actor);
    if (!validId(id)) failure("INVALID_INPUT");
    // Same response for foreign and unknown UUIDs; do not query another owner's row.
    if (id !== binding.membershipId) failure("NOT_FOUND");
    return this.#read(async (session) => {
      const row = await session.byMembershipId(id);
      if (!row) failure("NOT_PROVISIONED");
      return this.#view(row, binding);
    });
  }
  async aliasesForMember(actor: TrustedMember, id: string): Promise<readonly string[]> {
    return (await this.byMembershipId(actor, id)).legacyNumbers;
  }
  async resolveCode(actor: TrustedMember, value: unknown, normalization: CodeNormalization): Promise<MembershipResolutionView> {
    const binding = this.#owner(actor);
    let code: string | null;
    try { code = this.#core.normalizeMembershipCode(value, normalization); }
    catch { failure("INVALID_INPUT"); }
    if (code === null) failure("INVALID_INPUT");
    if (binding.membershipId === null) failure("NOT_FOUND");
    return this.#read(async (session) => {
      const row = await session.resolveCode(code, normalization);
      if (!row) failure("NOT_FOUND");
      if (row.membershipId !== binding.membershipId) failure("NOT_FOUND");
      const view = this.#view(row, binding);
      if (row.matchedCode !== code || !["CANONICAL", "ALIAS"].includes(row.matchedBy) ||
          (row.matchedBy === "CANONICAL" ? code !== view.canonicalNumber : !view.legacyNumbers.includes(code))) failure("INVALID_UPSTREAM_RESPONSE");
      return Object.freeze({ ...view, matchedBy: row.matchedBy, matchedCode: row.matchedCode });
    });
  }
}

/** Identity-only legacy field projection, NOT a complete me/Vehicle HTTP body. */
export function legacyMembershipCodes(view: MembershipIdentityView): {
  id: string; number: string; legacyNumbers: readonly string[];
} {
  return Object.freeze({ id: view.membershipId, number: view.canonicalNumber, legacyNumbers: view.legacyNumbers });
}
