/** Explicit original operations; concrete compatibility types supplied at composition. */
export interface OperationalSupervisionArguments {
  operations: unknown[];
  operationDetail: unknown[];
  terminals: unknown[];
  terminalStatus: unknown[];
  audit: unknown[];
}
export interface OperationalSupervisionViews {
  operations: unknown;
  operationDetail: unknown;
  terminals: unknown;
  terminalStatus: unknown;
  audit: unknown;
}
export interface OperationalSupervisionPort<I extends OperationalSupervisionArguments, V extends OperationalSupervisionViews> {
  operations(...args: I['operations']): Promise<V['operations']>;
  operationDetail(...args: I['operationDetail']): Promise<V['operationDetail']>;
  terminals(...args: I['terminals']): Promise<V['terminals']>;
  terminalStatus(...args: I['terminalStatus']): Promise<V['terminalStatus']>;
  audit(...args: I['audit']): Promise<V['audit']>;
}
