import { Inject, Injectable } from '@nestjs/common';
import { CONTROL_OPERATION_RECOVERY } from '../../application/ports/control-operation-recovery';
import type { ControlOperationRecoveryPort } from '../../application/ports/control-operation-recovery';
import type { ExistingControlOperationRecoveryArguments, ExistingControlOperationRecoveryViews } from '../outbound/existing-control-operation-recovery';

@Injectable()
export class ControlOperationRecoveryAdapter {
  constructor(@Inject(CONTROL_OPERATION_RECOVERY) private readonly engine: ControlOperationRecoveryPort<ExistingControlOperationRecoveryArguments, ExistingControlOperationRecoveryViews>) {}
  issueRecoveryTicket(...args: ExistingControlOperationRecoveryArguments['issueRecoveryTicket']) { return this.engine.issueRecoveryTicket(...args); }
  resolveOperation(...args: ExistingControlOperationRecoveryArguments['resolveOperation']) { return this.engine.resolveOperation(...args); }
  cancelUnpaidOperation(...args: ExistingControlOperationRecoveryArguments['cancelUnpaidOperation']) { return this.engine.cancelUnpaidOperation(...args); }
}
