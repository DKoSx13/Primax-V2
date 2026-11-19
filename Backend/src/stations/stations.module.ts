import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationsReadModule } from '../../services/catalog/src/bootstrap/stations-read.module';
@Module({
  imports: [StationsReadModule],
  exports: [StationsService],
  controllers: [StationsController],
  providers: [StationsService],
})
export class StationsModule {}
