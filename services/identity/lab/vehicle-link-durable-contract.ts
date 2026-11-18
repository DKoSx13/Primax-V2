import type { MembershipIdentityRead } from "./membership-a4-read";
export type DurableLinkCode = "INVALID_INPUT" | "DENIED" | "NOT_FOUND" | "BINDING_MISMATCH" |
  "IDEMPOTENCY_CONFLICT" | "OWNERSHIP_CONFLICT" | "UNAVAILABLE" | "OUTCOME_UNKNOWN" | "RECOVERY_REQUIRED";
export class DurableLinkError extends Error {
  readonly code: DurableLinkCode;
  readonly outcome: "NOT_SENT" | "REJECTED" | "UNKNOWN";
  constructor(code: DurableLinkCode, outcome: "NOT_SENT" | "REJECTED" | "UNKNOWN" = "UNKNOWN") {
    super(code); this.name = "DurableLinkError"; this.code = code; this.outcome = outcome;
  }
}
export interface DurablePrincipal {
  readonly kind: "member";
  readonly userId: string;
  readonly permissions: readonly ("vehicle:link:own" | "vehicle:result:own")[];
}
export interface DurableAuthorization { authenticate(credential: unknown): Promise<DurablePrincipal>; }
export interface DurableLinkCommand {
  readonly contractVersion: 2;
  readonly operationId: string;
  readonly expectedMembershipId: string;
  readonly plate: string;
  readonly label: string;
}
export interface VehicleSuccessReceipt {
  readonly contractVersion: 2;
  readonly policyVersion: "SUCCESS_ONLY_V1";
  readonly callerNamespace: string;
  readonly operationId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly vehicleId: string;
  readonly requestDigest: string;
  readonly plate: string;
  readonly label: string;
  readonly recordedAt: string;
}
export type DurableLinkResult = { readonly status: "COMMITTED"; readonly receipt: VehicleSuccessReceipt } |
  { readonly status: "NOT_OBSERVED" };
export interface DurableVehicleCommandPort {
  submit(userId: string, command: DurableLinkCommand): Promise<{ readonly status: "COMMITTED"; readonly receipt: VehicleSuccessReceipt }>;
}
export interface DurableVehicleResultPort {
  lookup(input: { readonly userId: string; readonly expectedMembershipId: string; readonly operationId: string }): Promise<DurableLinkResult>;
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function fail(code: DurableLinkCode, outcome: "NOT_SENT" | "REJECTED" | "UNKNOWN" = "NOT_SENT"): never { throw new DurableLinkError(code, outcome); }
/** New private profile. V1 remains correlation-only and is never reinterpreted. */
export class PrivateDurableVehicleLink {
  #authorization: DurableAuthorization;
  #identity: MembershipIdentityRead;
  #commands: DurableVehicleCommandPort;
  #results: DurableVehicleResultPort;
  constructor(authorization: DurableAuthorization, identity: MembershipIdentityRead, commands: DurableVehicleCommandPort,
    results: DurableVehicleResultPort, options: { synthetic: true }) {
    if (options?.synthetic !== true) fail("INVALID_INPUT");
    this.#authorization = authorization; this.#identity = identity; this.#commands = commands; this.#results = results;
  }
  async #subject(credential: unknown, permission: "vehicle:link:own" | "vehicle:result:own") {
    let actor: DurablePrincipal;
    try { actor = await this.#authorization.authenticate(credential); }
    catch (error) { if (error instanceof DurableLinkError && error.code === "DENIED") fail("DENIED"); fail("UNAVAILABLE"); }
    if (!actor || actor.kind !== "member" || !uuid(actor.userId) || !Array.isArray(actor.permissions) || !actor.permissions.includes(permission)) fail("DENIED");
    const userId = actor.userId;
    try {
      const identity = await this.#identity.forUser({ kind: "member", userId });
      if (!uuid(identity?.membershipId) || !uuid(identity?.accountId)) fail("BINDING_MISMATCH");
      return { userId, membershipId: identity.membershipId };
    } catch (error) {
      if (error instanceof DurableLinkError) throw error;
      const code = (error as { code?: unknown })?.code;
      if (code === "NOT_FOUND" || code === "NOT_PROVISIONED") fail("NOT_FOUND");
      if (code === "DENIED") fail("DENIED");
      if (code === "BINDING_MISMATCH") fail("BINDING_MISMATCH");
      fail("UNAVAILABLE");
    }
  }
  #view(value: DurableLinkResult, userId: string, membershipId: string, operationId: string, allowMissing: boolean): DurableLinkResult {
    if (value?.status === "NOT_OBSERVED" && allowMissing) return Object.freeze({ status: "NOT_OBSERVED" });
    if (value?.status !== "COMMITTED") fail("OUTCOME_UNKNOWN", "UNKNOWN");
    const r = value.receipt;
    if (!r || r.contractVersion !== 2 || r.policyVersion !== "SUCCESS_ONLY_V1" || !/^[a-z0-9-]{4,60}$/.test(r.callerNamespace) ||
        r.userId !== userId || r.membershipId !== membershipId || r.operationId !== operationId || !uuid(r.vehicleId) ||
        !/^[a-f0-9]{64}$/.test(r.requestDigest) || !/^[A-Z0-9]{3}-\d{3}$/.test(r.plate) ||
        typeof r.label !== "string" || [...r.label].length < 1 || [...r.label].length > 80 ||
        typeof r.recordedAt !== "string" || !Number.isFinite(Date.parse(r.recordedAt))) fail("OUTCOME_UNKNOWN", "UNKNOWN");
    return Object.freeze({ status: "COMMITTED", receipt: Object.freeze({ contractVersion: r.contractVersion,
      policyVersion: r.policyVersion, callerNamespace: r.callerNamespace, operationId: r.operationId,
      userId: r.userId, membershipId: r.membershipId, vehicleId: r.vehicleId, requestDigest: r.requestDigest,
      plate: r.plate, label: r.label, recordedAt: r.recordedAt }) });
  }
  async submit(credential: unknown, command: DurableLinkCommand) {
    const subject = await this.#subject(credential, "vehicle:link:own");
    if (!command || Object.keys(command).sort().join(",") !== "contractVersion,expectedMembershipId,label,operationId,plate" ||
        command.contractVersion !== 2 || !uuid(command.operationId) || !uuid(command.expectedMembershipId)) fail("INVALID_INPUT");
    if (command.expectedMembershipId !== subject.membershipId) fail("DENIED");
    try { return this.#view(await this.#commands.submit(subject.userId, command), subject.userId, subject.membershipId, command.operationId, false); }
    catch (error) { if (error instanceof DurableLinkError) throw error; fail("OUTCOME_UNKNOWN", "UNKNOWN"); }
  }
  async lookup(credential: unknown, operationId: string) {
    try {
      const subject = await this.#subject(credential, "vehicle:result:own");
      if (!uuid(operationId)) fail("INVALID_INPUT");
      return this.#view(await this.#results.lookup({ userId: subject.userId, expectedMembershipId: subject.membershipId, operationId }),
        subject.userId, subject.membershipId, operationId, true);
    } catch (error) {
      // Denying this query says nothing definitive about the earlier command.
      if (error instanceof DurableLinkError) throw new DurableLinkError(error.code, "UNKNOWN");
      fail("UNAVAILABLE", "UNKNOWN");
    }
  }
}
