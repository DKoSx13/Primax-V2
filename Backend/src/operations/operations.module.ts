import { Module } from '@nestjs/common';
import {
  OperationalAdminController,
  SupervisorController,
  TerminalController,
} from './operations.controller';
import { OperationsService } from './operations.service';
import { IncidentsModule } from '../incidents/incidents.module';
import { AuthModule } from '../auth/auth.module';
import { ControlStationController, StationHandoffController } from './station-workflow.controller';

@Module({
  controllers: [
    SupervisorController,
    TerminalController,
    OperationalAdminController,
    ControlStationController,
    StationHandoffController,
  ],
  imports: [IncidentsModule, AuthModule],
  providers: [OperationsService],
})
export class OperationsModule {}
