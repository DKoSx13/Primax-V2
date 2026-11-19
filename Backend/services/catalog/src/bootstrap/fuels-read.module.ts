import { Module } from '@nestjs/common';
import { CatalogReader } from '../../../../src/catalog-reader/catalog-reader';
import { FuelsRepository } from '../../../../src/fuels/fuels.repository';
import { FuelsReadAdapter } from '../adapters/inbound/fuels-read.adapter';
import { ExistingFuelListReader } from '../adapters/outbound/existing-fuel-list.reader';
import { LIST_FUELS_QUERY } from '../application/ports/list-fuels-query';
import type { FuelListReader } from '../application/ports/fuel-list-reader';
import { ListFuels } from '../application/use-cases/list-fuels';
import { InventoryReadAdapter } from '../adapters/inbound/inventory-read.adapter';
import { ExistingInventoryReader } from '../adapters/outbound/existing-inventory.reader';
import { INVENTORY_QUERY } from '../application/ports/inventory-query';
import type { InventoryReader } from '../application/ports/inventory-reader';
import { ReadInventory } from '../application/use-cases/read-inventory';

@Module({
  providers: [
    CatalogReader,
    FuelsRepository,
    ExistingFuelListReader,
    {
      provide: LIST_FUELS_QUERY,
      inject: [ExistingFuelListReader],
      useFactory: (reader: FuelListReader) => new ListFuels(reader),
    },
    FuelsReadAdapter,
    ExistingInventoryReader,
    { provide: INVENTORY_QUERY, inject: [ExistingInventoryReader],
      useFactory: (reader: InventoryReader) => new ReadInventory(reader) },
    InventoryReadAdapter,
  ],
  exports: [FuelsReadAdapter, InventoryReadAdapter, CatalogReader, FuelsRepository],
})
export class FuelsReadModule {}
