import { Injectable } from '@nestjs/common';
import { OperationsService } from '../../../../../src/operations/operations.service';
import { KioskService } from '../../../../../src/kiosk/kiosk.service';
import type { ControlOperationRecoveryPort } from '../../application/ports/control-operation-recovery';

export type ExistingControlOperationRecoveryArguments = {
  issueRecoveryTicket: Parameters<KioskService['issueRecoveryTicket']>;
  resolveOperation: Parameters<OperationsService['resolveOperation']>;
  cancelUnpaidOperation: Parameters<OperationsService['cancelUnpaidOperation']>;
};
export type ExistingControlOperationRecoveryViews = {
  issueRecoveryTicket: Awaited<ReturnType<KioskService['issueRecoveryTicket']>>;
  resolveOperation: Awaited<ReturnType<OperationsService['resolveOperation']>>;
  cancelUnpaidOperation: Awaited<ReturnType<OperationsService['cancelUnpaidOperation']>>;
};

@Injectable()
export class ExistingControlOperationRecovery implements ControlOperationRecoveryPort<ExistingControlOperationRecoveryArguments, ExistingControlOperationRecoveryViews> {
  constructor(private readonly operations: OperationsService, private readonly kiosk: KioskService) {}
  issueRecoveryTicket(...args: ExistingControlOperationRecoveryArguments['issueRecoveryTicket']) { return this.kiosk.issueRecoveryTicket(...args); }
  resolveOperation(...args: ExistingControlOperationRecoveryArguments['resolveOperation']) { return this.operations.resolveOperation(...args); }
  cancelUnpaidOperation(...args: ExistingControlOperationRecoveryArguments['cancelUnpaidOperation']) { return this.operations.cancelUnpaidOperation(...args); }
}
