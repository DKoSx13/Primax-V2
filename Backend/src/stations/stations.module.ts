import { CatalogReader } from '../catalog-reader/catalog-reader';
import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationsRepository } from './stations.repository';
@Module({
  exports: [StationsService],
  controllers: [StationsController],
  providers: [CatalogReader, StationsService, StationsRepository],
})
export class StationsModule {}
