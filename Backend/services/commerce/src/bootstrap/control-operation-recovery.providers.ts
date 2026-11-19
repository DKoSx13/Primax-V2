import type { Provider } from '@nestjs/common';
import { CONTROL_OPERATION_RECOVERY } from '../application/ports/control-operation-recovery';
import { ControlOperationRecovery } from '../application/use-cases/control-operation-recovery';
import { ControlOperationRecoveryAdapter } from '../adapters/inbound/control-operation-recovery.adapter';
import { ExistingControlOperationRecovery, ExistingControlOperationRecoveryArguments, ExistingControlOperationRecoveryViews } from '../adapters/outbound/existing-control-operation-recovery';

export const controlOperationRecoveryProviders: Provider[] = [
  ExistingControlOperationRecovery,
  { provide: CONTROL_OPERATION_RECOVERY, inject: [ExistingControlOperationRecovery],
    useFactory: (engine: ExistingControlOperationRecovery) => new ControlOperationRecovery<ExistingControlOperationRecoveryArguments, ExistingControlOperationRecoveryViews>(engine) },
  ControlOperationRecoveryAdapter,
];
