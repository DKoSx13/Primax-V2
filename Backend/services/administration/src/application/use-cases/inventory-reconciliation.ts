import type { InventoryReconciliationPort, InventoryReconciliationArguments, InventoryReconciliationViews } from '../ports/inventory-reconciliation';

export class InventoryReconciliation<I extends InventoryReconciliationArguments, V extends InventoryReconciliationViews> {
  constructor(private readonly port: InventoryReconciliationPort<I, V>) {}
  inspect(...args: I['inspect']) { return this.port.inspect(...args); }
  reconcile(...args: I['reconcile']) { return this.port.reconcile(...args); }
  activate(...args: I['activate']) { return this.port.activate(...args); }
}
export type { InventoryReconciliationArguments, InventoryReconciliationViews } from '../ports/inventory-reconciliation';
