import type { ControlOperationsService } from '../../../../../src/control/control-operations.service';
import type { InventoryAdministrationPort } from '../../application/ports/inventory-administration';

export type ExistingInventoryAdministrationArguments = {
  inventory: Parameters<ControlOperationsService['inventory']>;
  movements: Parameters<ControlOperationsService['movements']>;
  receiveInventory: Parameters<ControlOperationsService['receiveInventory']>;
  reconciliation: Parameters<ControlOperationsService['reconciliation']>;
  reconcile: Parameters<ControlOperationsService['reconcile']>;
};
export type ExistingInventoryAdministrationViews = {
  inventory: Awaited<ReturnType<ControlOperationsService['inventory']>>;
  movements: Awaited<ReturnType<ControlOperationsService['movements']>>;
  receiveInventory: Awaited<ReturnType<ControlOperationsService['receiveInventory']>>;
  reconciliation: Awaited<ReturnType<ControlOperationsService['reconciliation']>>;
  reconcile: Awaited<ReturnType<ControlOperationsService['reconcile']>>;
};

/** One invocation of the injected original engine; no retries, writes or transaction splitting. */
export class ExistingInventoryAdministration implements InventoryAdministrationPort<ExistingInventoryAdministrationArguments, ExistingInventoryAdministrationViews> {
  constructor(private readonly operations: ControlOperationsService) {}
  inventory(...args: ExistingInventoryAdministrationArguments['inventory']) { return this.operations.inventory(...args); }
  movements(...args: ExistingInventoryAdministrationArguments['movements']) { return this.operations.movements(...args); }
  receiveInventory(...args: ExistingInventoryAdministrationArguments['receiveInventory']) { return this.operations.receiveInventory(...args); }
  reconciliation(...args: ExistingInventoryAdministrationArguments['reconciliation']) { return this.operations.reconciliation(...args); }
  reconcile(...args: ExistingInventoryAdministrationArguments['reconcile']) { return this.operations.reconcile(...args); }
}
