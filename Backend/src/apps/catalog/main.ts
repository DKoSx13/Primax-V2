import { Module } from '@nestjs/common';
import { PrivateCatalogController } from '../../catalog-reader/private-catalog.controller';
import { bootstrapDomain } from '../bootstrap';
import { FuelsModule } from '../../fuels/fuels.module';
import { StationsModule } from '../../stations/stations.module';
import { BenefitsModule } from '../../benefits/benefits.module';

@Module({ imports: [FuelsModule, StationsModule], controllers: [PrivateCatalogController] })
class PrivateCatalogModule {}
void bootstrapDomain('catalog-service', [FuelsModule, StationsModule, BenefitsModule, PrivateCatalogModule]);
