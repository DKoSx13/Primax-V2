import { Injectable } from '@nestjs/common';
import { CatalogReader } from '../../../../../src/catalog-reader/catalog-reader';
import { FuelsRepository } from '../../../../../src/fuels/fuels.repository';
import type { FuelListReader } from '../../application/ports/fuel-list-reader';

/** Retains the current persistence implementation and optional HTTP selection. */
@Injectable()
export class ExistingFuelListReader implements FuelListReader {
  constructor(private readonly repo: FuelsRepository, private readonly reader: CatalogReader) {}

  list() {
    return this.reader.enabled()
      ? this.reader.read<Awaited<ReturnType<FuelsRepository['list']>>>('fuels')
      : this.repo.list();
  }
}
