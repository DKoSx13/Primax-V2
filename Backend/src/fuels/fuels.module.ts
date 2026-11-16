import { CatalogReader } from '../catalog-reader/catalog-reader';
import { Module } from '@nestjs/common';
import { FuelsController } from './fuels.controller';
import { FuelsService } from './fuels.service';
import { FuelsRepository } from './fuels.repository';
@Module({
  exports: [FuelsService],
  controllers: [FuelsController],
  providers: [CatalogReader, FuelsService, FuelsRepository],
})
export class FuelsModule {}
