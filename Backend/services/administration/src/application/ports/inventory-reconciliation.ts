/** Explicit original operations; concrete compatibility types supplied at composition. */
export interface InventoryReconciliationArguments {
  inspect: unknown[];
  reconcile: unknown[];
  activate: unknown[];
}
export interface InventoryReconciliationViews {
  inspect: unknown;
  reconcile: unknown;
  activate: unknown;
}
export interface InventoryReconciliationPort<I extends InventoryReconciliationArguments, V extends InventoryReconciliationViews> {
  inspect(...args: I['inspect']): Promise<V['inspect']>;
  reconcile(...args: I['reconcile']): Promise<V['reconcile']>;
  activate(...args: I['activate']): Promise<V['activate']>;
}
