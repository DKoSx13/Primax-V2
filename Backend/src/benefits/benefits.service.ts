import { CatalogReader } from '../catalog-reader/catalog-reader';
import { Injectable } from '@nestjs/common';
import { BenefitsRepository } from './benefits.repository';
@Injectable()
export class BenefitsService {
  constructor(private readonly repo: BenefitsRepository, private readonly reader: CatalogReader) {}
  list() {
    return this.reader.enabled() ? this.reader.read<Awaited<ReturnType<BenefitsRepository['list']>>>('benefits') : this.repo.list();
  }
}
