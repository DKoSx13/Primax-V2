import { Module } from '@nestjs/common';
import { CatalogReader } from '../../../../src/catalog-reader/catalog-reader';
import { StationsRepository } from '../../../../src/stations/stations.repository';
import { StationsReadAdapter } from '../adapters/inbound/stations-read.adapter';
import { ExistingStationListReader } from '../adapters/outbound/existing-station-list.reader';
import { LIST_STATIONS_QUERY } from '../application/ports/list-stations-query';
import type { StationListReader } from '../application/ports/station-list-reader';
import { ListStations } from '../application/use-cases/list-stations';

@Module({
  providers: [
    CatalogReader,
    StationsRepository,
    ExistingStationListReader,
    {
      provide: LIST_STATIONS_QUERY,
      inject: [ExistingStationListReader],
      useFactory: (reader: StationListReader) => new ListStations(reader),
    },
    StationsReadAdapter,
  ],
  exports: [StationsReadAdapter],
})
export class StationsReadModule {}
