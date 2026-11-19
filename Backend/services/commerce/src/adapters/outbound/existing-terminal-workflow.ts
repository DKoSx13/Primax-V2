import { Injectable } from '@nestjs/common';
import { OperationsService } from '../../../../../src/operations/operations.service';
import { KioskService } from '../../../../../src/kiosk/kiosk.service';
import type { TerminalWorkflowPort } from '../../application/ports/terminal-workflow';

export type ExistingTerminalWorkflowArguments = {
  claimTerminal: Parameters<KioskService['claimTerminal']>;
  terminalMe: Parameters<OperationsService['terminalMe']>;
  startOperation: Parameters<OperationsService['startOperation']>;
  operation: Parameters<OperationsService['operation']>;
  recoveryState: Parameters<OperationsService['recoveryState']>;
  closeOperation: Parameters<OperationsService['closeOperation']>;
};
export type ExistingTerminalWorkflowViews = {
  claimTerminal: Awaited<ReturnType<KioskService['claimTerminal']>>;
  terminalMe: Awaited<ReturnType<OperationsService['terminalMe']>>;
  startOperation: Awaited<ReturnType<OperationsService['startOperation']>>;
  operation: Awaited<ReturnType<OperationsService['operation']>>;
  recoveryState: Awaited<ReturnType<OperationsService['recoveryState']>>;
  closeOperation: Awaited<ReturnType<OperationsService['closeOperation']>>;
};

@Injectable()
export class ExistingTerminalWorkflow implements TerminalWorkflowPort<ExistingTerminalWorkflowArguments, ExistingTerminalWorkflowViews> {
  constructor(private readonly operations: OperationsService, private readonly kiosk: KioskService) {}
  claimTerminal(...args: ExistingTerminalWorkflowArguments['claimTerminal']) { return this.kiosk.claimTerminal(...args); }
  terminalMe(...args: ExistingTerminalWorkflowArguments['terminalMe']) { return this.operations.terminalMe(...args); }
  startOperation(...args: ExistingTerminalWorkflowArguments['startOperation']) { return this.operations.startOperation(...args); }
  operation(...args: ExistingTerminalWorkflowArguments['operation']) { return this.operations.operation(...args); }
  recoveryState(...args: ExistingTerminalWorkflowArguments['recoveryState']) { return this.operations.recoveryState(...args); }
  closeOperation(...args: ExistingTerminalWorkflowArguments['closeOperation']) { return this.operations.closeOperation(...args); }
}
