import type { InventoryReconciliation, InventoryReconciliationArguments, InventoryReconciliationViews } from '../../application/use-cases/inventory-reconciliation';
export type { InventoryReconciliationArguments, InventoryReconciliationViews } from '../../application/ports/inventory-reconciliation';

export class InventoryReconciliationAdapter<I extends InventoryReconciliationArguments, V extends InventoryReconciliationViews> {
  constructor(private readonly port: InventoryReconciliation<I, V>) {}
  inspect(...args: I['inspect']) { return this.port.inspect(...args); }
  reconcile(...args: I['reconcile']) { return this.port.reconcile(...args); }
  activate(...args: I['activate']) { return this.port.activate(...args); }
}
