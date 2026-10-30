import { Module } from '@nestjs/common';
import { AssistanceService } from './assistance.service';
import {
  ControlAssistanceController,
  TerminalAssistanceController,
} from './assistance.controller';

@Module({
  controllers: [ControlAssistanceController, TerminalAssistanceController],
  providers: [AssistanceService],
})
export class AssistanceModule {}
