/** Explicit original operations; concrete compatibility types supplied at composition. */
export interface InventoryAdministrationArguments {
  inventory: unknown[];
  movements: unknown[];
  receiveInventory: unknown[];
  reconciliation: unknown[];
  reconcile: unknown[];
}
export interface InventoryAdministrationViews {
  inventory: unknown;
  movements: unknown;
  receiveInventory: unknown;
  reconciliation: unknown;
  reconcile: unknown;
}
export interface InventoryAdministrationPort<I extends InventoryAdministrationArguments, V extends InventoryAdministrationViews> {
  inventory(...args: I['inventory']): Promise<V['inventory']>;
  movements(...args: I['movements']): Promise<V['movements']>;
  receiveInventory(...args: I['receiveInventory']): Promise<V['receiveInventory']>;
  reconciliation(...args: I['reconciliation']): Promise<V['reconciliation']>;
  reconcile(...args: I['reconcile']): Promise<V['reconcile']>;
}
