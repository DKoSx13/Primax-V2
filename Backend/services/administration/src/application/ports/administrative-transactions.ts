/** Explicit original operations; concrete compatibility types supplied at composition. */
export interface AdministrativeTransactionsArguments {
  transactions: unknown[];
}
export interface AdministrativeTransactionsViews {
  transactions: unknown;
}
export interface AdministrativeTransactionsPort<I extends AdministrativeTransactionsArguments, V extends AdministrativeTransactionsViews> {
  transactions(...args: I['transactions']): Promise<V['transactions']>;
}
