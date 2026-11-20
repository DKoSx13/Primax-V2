import type { ControlOperationsService } from '../../../../src/control/control-operations.service';
import { InventoryAdministration } from '../application/use-cases/inventory-administration';
import { InventoryAdministrationAdapter } from '../adapters/inbound/inventory-administration.adapter';
import { ExistingInventoryAdministration, ExistingInventoryAdministrationArguments, ExistingInventoryAdministrationViews } from '../adapters/outbound/existing-inventory-administration';

export function composeInventoryAdministration(operations: ControlOperationsService) {
  return new InventoryAdministrationAdapter(new InventoryAdministration<ExistingInventoryAdministrationArguments, ExistingInventoryAdministrationViews>(new ExistingInventoryAdministration(operations)));
}
