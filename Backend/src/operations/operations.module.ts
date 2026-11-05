import { ControlPaymentsController, ControlPaymentsService } from './control-payments';
import { PaymentsModule } from '../payments/payments.module';
import { Module } from '@nestjs/common';
import {
  OperationalAdminController,
  TerminalController,
  ControlTerminalRecoveryController,
} from './operations.controller';
import { OperationsService } from './operations.service';
import { IncidentsModule } from '../incidents/incidents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [ControlPaymentsController,
      TerminalController,
    OperationalAdminController,
    ControlTerminalRecoveryController,
  ],
  imports: [PaymentsModule,IncidentsModule, AuthModule],
  providers: [OperationsService,ControlPaymentsService],
})
export class OperationsModule {}
