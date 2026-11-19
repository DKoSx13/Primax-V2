import { Injectable } from '@nestjs/common';
import { CatalogReader } from '../../../../../src/catalog-reader/catalog-reader';
import { StationsRepository } from '../../../../../src/stations/stations.repository';
import type { StationListReader } from '../../application/ports/station-list-reader';

@Injectable()
export class ExistingStationListReader implements StationListReader {
  constructor(private readonly repo: StationsRepository, private readonly reader: CatalogReader) {}

  list() {
    return this.reader.enabled()
      ? this.reader.read<Awaited<ReturnType<StationsRepository['list']>>>('stations')
      : this.repo.list();
  }
}
