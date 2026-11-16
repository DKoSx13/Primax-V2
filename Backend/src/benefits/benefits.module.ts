import { CatalogReader } from '../catalog-reader/catalog-reader';
import { Module } from '@nestjs/common';
import { BenefitsController } from './benefits.controller';
import { BenefitsService } from './benefits.service';
import { BenefitsRepository } from './benefits.repository';
@Module({
  controllers: [BenefitsController],
  providers: [CatalogReader, BenefitsService, BenefitsRepository],
})
export class BenefitsModule {}
