import { Module } from '@nestjs/common';
import { BenefitsController } from './benefits.controller';
import { BenefitsService } from './benefits.service';
import { BenefitsReadModule } from '../../services/catalog/src/bootstrap/benefits-read.module';
@Module({
  imports: [BenefitsReadModule],
  controllers: [BenefitsController],
  providers: [BenefitsService],
})
export class BenefitsModule {}
