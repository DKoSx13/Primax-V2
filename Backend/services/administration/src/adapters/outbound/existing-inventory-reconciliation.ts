import type { InventoryReconciliationService } from '../../../../../src/inventory/inventory-reconciliation';
import type { InventoryReconciliationPort } from '../../application/ports/inventory-reconciliation';

export type ExistingInventoryReconciliationArguments = {
  inspect: Parameters<InventoryReconciliationService['inspect']>;
  reconcile: Parameters<InventoryReconciliationService['reconcile']>;
  activate: Parameters<InventoryReconciliationService['activate']>;
};
export type ExistingInventoryReconciliationViews = {
  inspect: Awaited<ReturnType<InventoryReconciliationService['inspect']>>;
  reconcile: Awaited<ReturnType<InventoryReconciliationService['reconcile']>>;
  activate: Awaited<ReturnType<InventoryReconciliationService['activate']>>;
};

/** One invocation of the injected original engine; no retries, writes or transaction splitting. */
export class ExistingInventoryReconciliation implements InventoryReconciliationPort<ExistingInventoryReconciliationArguments, ExistingInventoryReconciliationViews> {
  constructor(private readonly inventory: InventoryReconciliationService) {}
  inspect(...args: ExistingInventoryReconciliationArguments['inspect']) { return this.inventory.inspect(...args); }
  reconcile(...args: ExistingInventoryReconciliationArguments['reconcile']) { return this.inventory.reconcile(...args); }
  activate(...args: ExistingInventoryReconciliationArguments['activate']) { return this.inventory.activate(...args); }
}
