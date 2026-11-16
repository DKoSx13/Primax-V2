import { RecognitionController } from './recognition.controller';
import { RecognitionService } from './recognition.service';
import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from '../../adapters/vehicles.service';
import { VehiclesRepository } from '../../persistence/vehicles.repository';
@Module({
  controllers: [VehiclesController, RecognitionController],
  providers: [VehiclesService, VehiclesRepository, RecognitionService],
})
export class VehiclesModule {}
