import type { InventoryAdministration, InventoryAdministrationArguments, InventoryAdministrationViews } from '../../application/use-cases/inventory-administration';
export type { InventoryAdministrationArguments, InventoryAdministrationViews } from '../../application/ports/inventory-administration';

export class InventoryAdministrationAdapter<I extends InventoryAdministrationArguments, V extends InventoryAdministrationViews> {
  constructor(private readonly port: InventoryAdministration<I, V>) {}
  inventory(...args: I['inventory']) { return this.port.inventory(...args); }
  movements(...args: I['movements']) { return this.port.movements(...args); }
  receiveInventory(...args: I['receiveInventory']) { return this.port.receiveInventory(...args); }
  reconciliation(...args: I['reconciliation']) { return this.port.reconciliation(...args); }
  reconcile(...args: I['reconcile']) { return this.port.reconcile(...args); }
}
