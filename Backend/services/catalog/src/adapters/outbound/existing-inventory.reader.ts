import { Injectable } from '@nestjs/common';
import { CatalogReader } from '../../../../../src/catalog-reader/catalog-reader';
import { FuelsRepository } from '../../../../../src/fuels/fuels.repository';
import type { InventoryReader } from '../../application/ports/inventory-reader';

@Injectable()
export class ExistingInventoryReader implements InventoryReader {
  constructor(private readonly repo: FuelsRepository, private readonly reader: CatalogReader) {}
  inventory() {
    return this.reader.enabled()
      ? this.reader.read<Awaited<ReturnType<FuelsRepository['inventory']>>>('fuels/inventory')
      : this.repo.inventory();
  }
}
