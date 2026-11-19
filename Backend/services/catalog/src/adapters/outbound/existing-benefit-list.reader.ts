import { Injectable } from '@nestjs/common';
import { CatalogReader } from '../../../../../src/catalog-reader/catalog-reader';
import { BenefitsRepository } from '../../../../../src/benefits/benefits.repository';
import type { BenefitListReader } from '../../application/ports/benefit-list-reader';

@Injectable()
export class ExistingBenefitListReader implements BenefitListReader {
  constructor(private readonly repo: BenefitsRepository, private readonly reader: CatalogReader) {}

  list() {
    return this.reader.enabled()
      ? this.reader.read<Awaited<ReturnType<BenefitsRepository['list']>>>('benefits')
      : this.repo.list();
  }
}
