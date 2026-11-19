import type { InventoryReader } from '../ports/inventory-reader';
import type { InventoryQuery } from '../ports/inventory-query';

export class ReadInventory implements InventoryQuery {
  constructor(private readonly reader: InventoryReader) {}
  execute() { return this.reader.inventory(); }
}
