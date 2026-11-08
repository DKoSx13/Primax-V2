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
import { AuthCoreModule } from '../auth/auth.module';

@Module({
  controllers: [ControlPaymentsController,
      TerminalController,
    OperationalAdminController,
    ControlTerminalRecoveryController,
  ],
  imports: [PaymentsModule,IncidentsModule, AuthCoreModule],
  providers: [OperationsService,ControlPaymentsService],
})
export class OperationsModule {}
