import type { InventoryReadModel } from '../inventory-read-model';

export const INVENTORY_QUERY = Symbol('catalog.read-inventory');
export interface InventoryQuery {
  execute(): Promise<InventoryReadModel[]>;
}
