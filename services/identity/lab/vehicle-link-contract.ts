import type { MembershipIdentityRead } from "./membership-a4-read";

export type VehicleLinkErrorCode = "INVALID_INPUT" | "DENIED" | "NOT_FOUND" | "BINDING_MISMATCH" |
  "OWNERSHIP_CONFLICT" | "UNAVAILABLE" | "OUTCOME_UNKNOWN";
export type CommandOutcome = "NOT_SENT" | "REJECTED" | "UNKNOWN";
export class VehicleLinkError extends Error {
  readonly code: VehicleLinkErrorCode;
  readonly outcome: CommandOutcome;
  constructor(code: VehicleLinkErrorCode, outcome: CommandOutcome = "NOT_SENT") {
    super(code); this.name = "VehicleLinkError"; this.code = code; this.outcome = outcome;
  }
}
export interface VehiclePrincipal {
  readonly kind: "member";
  readonly userId: string;
  readonly permissions: readonly ("vehicle:link:own" | "vehicle:read:own")[];
}
/** Credential verification is external; accepting a userId from a body is not authentication. */
export interface VehicleLinkAuthorization {
  authenticate(credential: unknown): Promise<VehiclePrincipal>;
}
export interface VehicleLinkCommandV1 {
  readonly contractVersion: 1;
  /** Correlation ONLY: the legacy provider has no durable idempotency receipt. */
  readonly operationId: string;
  readonly expectedMembershipId: string;
  readonly plate: string;
  readonly label: string;
}
export interface VehicleBinding {
  readonly vehicleId: string;
  readonly membershipId: string;
  readonly plate: string;
  readonly label: string;
}
export interface LegacyVehicleLinkPort {
  linkForOwner(input: { readonly userId: string; readonly expectedMembershipId: string;
    readonly plate: string; readonly label: string }): Promise<VehicleBinding>;
}
export interface LegacyVehicleOwnerReadPort {
  forOwner(input: { readonly userId: string; readonly plate: string }): Promise<VehicleBinding>;
}
export interface VehicleNormalization {
  plate(value: unknown): unknown;
  label(value: unknown): unknown;
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function fail(code: VehicleLinkErrorCode, outcome: CommandOutcome = "NOT_SENT"): never { throw new VehicleLinkError(code, outcome); }

/** Isolated application. Exactly one delegation per invocation; no receipts, retry,
 * timeout replay, financial projection, Vehicle persistence or public transport.
 */
export class PrivateVehicleLinkV1 {
  #authorization: VehicleLinkAuthorization;
  #identity: MembershipIdentityRead;
  #commands: LegacyVehicleLinkPort;
  #queries: LegacyVehicleOwnerReadPort;
  #normalization: VehicleNormalization;
  constructor(authorization: VehicleLinkAuthorization, identity: MembershipIdentityRead,
    commands: LegacyVehicleLinkPort, queries: LegacyVehicleOwnerReadPort, normalization: VehicleNormalization,
    options: { synthetic: true }) {
    if (options?.synthetic !== true) fail("INVALID_INPUT");
    this.#authorization = authorization; this.#identity = identity; this.#commands = commands;
    this.#queries = queries; this.#normalization = normalization;
  }
  async #owner(credential: unknown, permission: "vehicle:link:own" | "vehicle:read:own") {
    let actor: VehiclePrincipal;
    try { actor = await this.#authorization.authenticate(credential); }
    catch (error) {
      if (error instanceof VehicleLinkError && error.code === "DENIED") fail("DENIED");
      fail("UNAVAILABLE");
    }
    if (!actor || actor.kind !== "member" || !uuid(actor.userId) || !Array.isArray(actor.permissions) ||
        !actor.permissions.includes(permission)) fail("DENIED");
    try {
      const identity = await this.#identity.forUser({ kind: "member", userId: actor.userId });
      if (!identity || !uuid(identity.membershipId) || !uuid(identity.accountId)) fail("BINDING_MISMATCH");
      return { actor, identity };
    } catch (error) {
      if (error instanceof VehicleLinkError) throw error;
      const code = (error as { code?: unknown })?.code;
      if (code === "DENIED") fail("DENIED");
      if (code === "NOT_FOUND" || code === "NOT_PROVISIONED") fail("NOT_FOUND");
      if (code === "BINDING_MISMATCH" || code === "INVALID_UPSTREAM_RESPONSE") fail("BINDING_MISMATCH");
      fail("UNAVAILABLE");
    }
  }
  #plate(value: unknown): string {
    let result: unknown;
    try { result = this.#normalization.plate(value); } catch { fail("INVALID_INPUT"); }
    if (typeof result !== "string" || !/^[A-Z0-9]{3}-\d{3}$/.test(result)) fail("INVALID_INPUT");
    return result;
  }
  #result(row: VehicleBinding, member: string, plate: string, outcome: CommandOutcome): VehicleBinding {
    if (!row || !uuid(row.vehicleId) || row.membershipId !== member || row.plate !== plate ||
        typeof row.label !== "string" || [...row.label].length < 1 || [...row.label].length > 80)
      fail(outcome === "UNKNOWN" ? "OUTCOME_UNKNOWN" : "BINDING_MISMATCH", outcome);
    return Object.freeze({ vehicleId: row.vehicleId, membershipId: row.membershipId, plate: row.plate, label: row.label });
  }
  async link(credential: unknown, command: VehicleLinkCommandV1) {
    const { actor, identity } = await this.#owner(credential, "vehicle:link:own");
    if (!command || Object.keys(command).sort().join(",") !== "contractVersion,expectedMembershipId,label,operationId,plate" ||
        command.contractVersion !== 1 || !uuid(command.operationId) || !uuid(command.expectedMembershipId)) fail("INVALID_INPUT");
    if (command.expectedMembershipId !== identity.membershipId) fail("DENIED");
    const plate = this.#plate(command.plate);
    let label: unknown;
    try { label = this.#normalization.label(command.label); } catch { fail("INVALID_INPUT"); }
    if (typeof label !== "string" || [...label].length < 1 || [...label].length > 80) fail("INVALID_INPUT");
    let row: VehicleBinding;
    try { row = await this.#commands.linkForOwner({ userId: actor.userId, expectedMembershipId: identity.membershipId, plate, label }); }
    catch (error) {
      if (error instanceof VehicleLinkError) throw error;
      // The call may already have committed. Never automatically retry it.
      fail("OUTCOME_UNKNOWN", "UNKNOWN");
    }
    return Object.freeze({ contractVersion: 1 as const, operationId: command.operationId,
      outcome: "LINK_CONFIRMED" as const, recovery: "STATE_CONVERGENCE_ONLY" as const,
      ...this.#result(row, identity.membershipId, plate, "UNKNOWN") });
  }
  async forOwner(credential: unknown, value: unknown): Promise<VehicleBinding> {
    const { actor, identity } = await this.#owner(credential, "vehicle:read:own");
    const plate = this.#plate(value);
    try { return this.#result(await this.#queries.forOwner({ userId: actor.userId, plate }), identity.membershipId, plate, "NOT_SENT"); }
    catch (error) {
      if (error instanceof VehicleLinkError) throw error;
      fail("UNAVAILABLE");
    }
  }
}
