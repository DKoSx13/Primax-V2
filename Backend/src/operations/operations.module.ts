import { controlPaymentWorkflowProviders } from '../../services/commerce/src/bootstrap/control-payment-workflow.providers';
import { controlOperationRecoveryProviders } from '../../services/commerce/src/bootstrap/control-operation-recovery.providers';
import { terminalWorkflowProviders } from '../../services/commerce/src/bootstrap/terminal-workflow.providers';
import { operationalAdministrationProviders } from '../../services/commerce/src/bootstrap/operational-administration.providers';
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
  providers: [
    ...controlPaymentWorkflowProviders,
    ...controlOperationRecoveryProviders,
    ...terminalWorkflowProviders,
    ...operationalAdministrationProviders,
    OperationsService,
    ControlPaymentsService,
  ],
})
export class OperationsModule {}
