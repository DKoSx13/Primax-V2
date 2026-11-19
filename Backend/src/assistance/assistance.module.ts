import { assistanceWorkflowProviders } from '../../services/commerce/src/bootstrap/assistance-workflow.providers';
import { Module } from '@nestjs/common';
import { AssistanceService } from './assistance.service';
import {
  ControlAssistanceController,
  TerminalAssistanceController,
} from './assistance.controller';

@Module({
  controllers: [ControlAssistanceController, TerminalAssistanceController],
  providers: [
    ...assistanceWorkflowProviders,
    AssistanceService,
  ],
})
export class AssistanceModule {}
