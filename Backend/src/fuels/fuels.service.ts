import { CatalogReader } from '../catalog-reader/catalog-reader';
import { Injectable } from '@nestjs/common';
import { FuelsRepository } from './fuels.repository';
import { FuelsReadAdapter } from '../../services/catalog/src/adapters/inbound/fuels-read.adapter';
@Injectable()
export class FuelsService {
  constructor(private readonly repo: FuelsRepository, private readonly reader: CatalogReader, private readonly fuelsRead: FuelsReadAdapter) {}
  inventory() { return this.reader.enabled() ? this.reader.read<Awaited<ReturnType<FuelsRepository['inventory']>>>('fuels/inventory') : this.repo.inventory(); }
  list() {
    return this.fuelsRead.list();
  }
}
