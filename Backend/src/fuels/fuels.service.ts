import { CatalogReader } from '../catalog-reader/catalog-reader';
import { Injectable } from '@nestjs/common';
import { FuelsRepository } from './fuels.repository';
@Injectable()
export class FuelsService {
  constructor(private readonly repo: FuelsRepository, private readonly reader: CatalogReader) {}
  inventory() { return this.reader.enabled() ? this.reader.read<Awaited<ReturnType<FuelsRepository['inventory']>>>('fuels/inventory') : this.repo.inventory(); }
  list() {
    return this.reader.enabled() ? this.reader.read<Awaited<ReturnType<FuelsRepository['list']>>>('fuels') : this.repo.list();
  }
}
