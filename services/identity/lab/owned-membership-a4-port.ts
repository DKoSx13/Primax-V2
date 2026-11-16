import type { CodeNormalization, MembershipCodeLookup } from "../src/membership-codes/core";

/** Experimental only; no HTTP, runtime binding, account creation or Vehicle state. */
export interface SyntheticMembershipProvision {
  readonly operationId: string;
  readonly membershipId: string;
  readonly accountId: string;
  readonly normalization: CodeNormalization;
  readonly aliases: readonly string[];
}
export interface SyntheticAllocationReceipt {
  readonly operationId: string;
  readonly membershipId: string;
  readonly canonicalCode: string;
  readonly allocatedOrdinal: string;
  readonly requestDigest: string;
  readonly contractVersion: 1;
  readonly policyVersion: "A4_UNIFIED_EXPLICIT_V1";
}
export interface SyntheticMembershipStore {
  provision(command: SyntheticMembershipProvision): Promise<SyntheticAllocationReceipt>;
  lookup(operationId: string): Promise<SyntheticAllocationReceipt | null>;
  resolve(code: unknown, normalization: CodeNormalization): Promise<unknown>;
}
export interface PrivateSqlSession {
  query(sql: string, values?: readonly unknown[]): Promise<Record<string, unknown>[]>;
}
export interface PrivateSqlTransactions {
  /** Must rollback the entire callback on error; never retry ambiguous commits. */
  atomic<T>(work: (session: PrivateSqlSession) => Promise<T>): Promise<T>;
  snapshot<T>(work: (session: PrivateSqlSession) => Promise<T>): Promise<T>;
}
/** A lookup is scoped to a single snapshot, never a shared transaction singleton. */
export type SnapshotCodeLookup = MembershipCodeLookup;
