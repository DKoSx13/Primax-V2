import { Injectable } from '@nestjs/common';
import { InventoryReadAdapter } from '../../services/catalog/src/adapters/inbound/inventory-read.adapter';
import { FuelsReadAdapter } from '../../services/catalog/src/adapters/inbound/fuels-read.adapter';
@Injectable()
export class FuelsService {
  constructor(private readonly inventoryRead: InventoryReadAdapter, private readonly fuelsRead: FuelsReadAdapter) {}
  inventory() { return this.inventoryRead.inventory(); }
  list() {
    return this.fuelsRead.list();
  }
}
