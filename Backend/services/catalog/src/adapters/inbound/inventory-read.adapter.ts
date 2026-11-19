import { Inject, Injectable } from '@nestjs/common';
import { INVENTORY_QUERY } from '../../application/ports/inventory-query';
import type { InventoryQuery } from '../../application/ports/inventory-query';

@Injectable()
export class InventoryReadAdapter {
  constructor(@Inject(INVENTORY_QUERY) private readonly query: InventoryQuery) {}
  inventory() { return this.query.execute(); }
}
