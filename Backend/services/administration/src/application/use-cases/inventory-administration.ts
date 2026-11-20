import type { InventoryAdministrationPort, InventoryAdministrationArguments, InventoryAdministrationViews } from '../ports/inventory-administration';

export class InventoryAdministration<I extends InventoryAdministrationArguments, V extends InventoryAdministrationViews> {
  constructor(private readonly port: InventoryAdministrationPort<I, V>) {}
  inventory(...args: I['inventory']) { return this.port.inventory(...args); }
  movements(...args: I['movements']) { return this.port.movements(...args); }
  receiveInventory(...args: I['receiveInventory']) { return this.port.receiveInventory(...args); }
  reconciliation(...args: I['reconciliation']) { return this.port.reconciliation(...args); }
  reconcile(...args: I['reconcile']) { return this.port.reconcile(...args); }
}
export type { InventoryAdministrationArguments, InventoryAdministrationViews } from '../ports/inventory-administration';
