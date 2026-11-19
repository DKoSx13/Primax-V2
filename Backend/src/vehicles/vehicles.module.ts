import { RecognitionController } from './recognition.controller';
import { RecognitionService } from './recognition.service';
import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleListReadModule } from '../../services/identity/src/bootstrap/vehicle-list-read.module';
@Module({
  imports: [VehicleListReadModule],
  controllers: [VehiclesController, RecognitionController],
  providers: [VehiclesService, RecognitionService],
})
export class VehiclesModule {}
