import { CatalogReader } from '../catalog-reader/catalog-reader';
import { Injectable } from '@nestjs/common';
import { StationsRepository } from './stations.repository';
@Injectable()
export class StationsService {
  constructor(private readonly repo: StationsRepository, private readonly reader: CatalogReader) {}
  list() {
    return this.reader.enabled() ? this.reader.read<Awaited<ReturnType<StationsRepository['list']>>>('stations') : this.repo.list();
  }
}
