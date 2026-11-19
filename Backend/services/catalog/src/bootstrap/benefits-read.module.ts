import { Module } from '@nestjs/common';
import { CatalogReader } from '../../../../src/catalog-reader/catalog-reader';
import { BenefitsRepository } from '../../../../src/benefits/benefits.repository';
import { BenefitsReadAdapter } from '../adapters/inbound/benefits-read.adapter';
import { ExistingBenefitListReader } from '../adapters/outbound/existing-benefit-list.reader';
import { LIST_BENEFITS_QUERY } from '../application/ports/list-benefits-query';
import type { BenefitListReader } from '../application/ports/benefit-list-reader';
import { ListBenefits } from '../application/use-cases/list-benefits';

@Module({
  providers: [
    CatalogReader,
    BenefitsRepository,
    ExistingBenefitListReader,
    {
      provide: LIST_BENEFITS_QUERY,
      inject: [ExistingBenefitListReader],
      useFactory: (reader: BenefitListReader) => new ListBenefits(reader),
    },
    BenefitsReadAdapter,
  ],
  exports: [BenefitsReadAdapter],
})
export class BenefitsReadModule {}
