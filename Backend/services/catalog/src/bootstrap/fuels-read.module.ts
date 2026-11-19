import { Module } from '@nestjs/common';
import { CatalogReader } from '../../../../src/catalog-reader/catalog-reader';
import { FuelsRepository } from '../../../../src/fuels/fuels.repository';
import { FuelsReadAdapter } from '../adapters/inbound/fuels-read.adapter';
import { ExistingFuelListReader } from '../adapters/outbound/existing-fuel-list.reader';
import { LIST_FUELS_QUERY } from '../application/ports/list-fuels-query';
import type { FuelListReader } from '../application/ports/fuel-list-reader';
import { ListFuels } from '../application/use-cases/list-fuels';

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
  ],
  exports: [FuelsReadAdapter, CatalogReader, FuelsRepository],
})
export class FuelsReadModule {}
