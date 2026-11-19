import type { InventoryReadModel } from '../inventory-read-model';

export interface InventoryReader {
  inventory(): Promise<InventoryReadModel[]>;
}
