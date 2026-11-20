import type { InventoryReconciliationService } from '../../../../src/inventory/inventory-reconciliation';
import { InventoryReconciliation } from '../application/use-cases/inventory-reconciliation';
import { InventoryReconciliationAdapter } from '../adapters/inbound/inventory-reconciliation.adapter';
import { ExistingInventoryReconciliation, ExistingInventoryReconciliationArguments, ExistingInventoryReconciliationViews } from '../adapters/outbound/existing-inventory-reconciliation';

export function composeInventoryReconciliation(inventory: InventoryReconciliationService) {
  return new InventoryReconciliationAdapter(new InventoryReconciliation<ExistingInventoryReconciliationArguments, ExistingInventoryReconciliationViews>(new ExistingInventoryReconciliation(inventory)));
}
