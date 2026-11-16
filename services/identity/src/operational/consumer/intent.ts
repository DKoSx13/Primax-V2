import { ContractFailure } from "../remote/contract";
import type { OperationalSessionResult } from "../port";
import type { RemoteCommand } from "../remote/contract";

/** Trusted output of the authentication adapter, never fields accepted in JSON. */
export interface ConsumerActor {
  userId: string;
  authVersion: number;
  permissions: string[];
  stationIds: string[];
  global: boolean;
}
export interface IntentReference {
  intentId: string;
  expiresAt: Date;
}
export interface PrepareV2 {
  callerOperationId: string;
  action: "TERMINAL_CREDENTIAL_ISSUE";
  stationId: string;
  terminalId: string;
  expiresAt: string;
}
export type ControlTarget = Omit<PrepareV2, "callerOperationId">;
export interface ConsumerIntentStore {
  verifyTarget?(actor: ConsumerActor, target: ControlTarget): Promise<void>;
  createV2?(actor: ConsumerActor, request: PrepareV2): Promise<IntentReference>;
  create(actor: ConsumerActor, terminalId: string): Promise<IntentReference>;
  read(actor: ConsumerActor, intentId: string): Promise<RemoteCommand>;
}
export interface ConsumerReceipts {
  lookup(command: RemoteCommand): Promise<OperationalSessionResult | undefined>;
  execute(command: RemoteCommand): Promise<OperationalSessionResult>;
}
/** Preparing a NEW intent is explicit, not inferred from identical payloads.
 * The journal commits BEFORE any external call; no receipt or token is cached locally.
 */
export class ConsumerOperations {
  constructor(
    private readonly journal: ConsumerIntentStore,
    private readonly remote: ConsumerReceipts,
  ) {}
  prepare(actor: ConsumerActor, terminalId: string) {
    return this.journal.create(actor, terminalId);
  }
  prepareV2(actor: ConsumerActor, request: PrepareV2) {
    if (!this.journal.createV2) throw new Error("V2 unavailable");
    return this.journal.createV2(actor, request);
  }
  async verifyControl(actor: ConsumerActor, target: ControlTarget) {
    if (!this.journal.verifyTarget) throw new Error("Verification unavailable");
    await this.journal.verifyTarget(actor, target);
  }
  async execute(
    actor: ConsumerActor,
    intentId: string,
    serviceStation?: string,
  ) {
    const command = await this.journal.read(actor, intentId);
    if (serviceStation && command.command.stationId !== serviceStation)
      throw new ContractFailure(403, "SERVICE_SCOPE_FORBIDDEN");
    const prior = await this.remote.lookup(command);
    return prior ?? this.remote.execute(command);
  }
}
