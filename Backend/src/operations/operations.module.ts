import { SupervisorPaymentsController, SupervisorPaymentsService } from './supervisor-payments';
import { PaymentsModule } from '../payments/payments.module';
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
  controllers: [SupervisorPaymentsController,
    SupervisorController,
    TerminalController,
    OperationalAdminController,
    ControlStationController,
    StationHandoffController,
  ],
  imports: [PaymentsModule,IncidentsModule, AuthModule],
  providers: [OperationsService,SupervisorPaymentsService],
})
export class OperationsModule {}
