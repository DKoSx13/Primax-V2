import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  SetMetadata,
} from '@nestjs/common';
import { AssistanceReason, AssistanceStatus } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Actor, CurrentActor, TerminalOnly } from '../auth/access';
import { AssistanceService } from './assistance.service';

export class CreateAssistanceDto {
  @IsUUID('4') requestId: string;
  @IsEnum(AssistanceReason) reason: AssistanceReason;
  @IsOptional() @IsUUID('4') operationId?: string;
  @IsOptional() @IsString() @MaxLength(500) observation?: string;
  @IsOptional() @Matches(/^[A-Z0-9]{3}-[0-9]{3}$/) plate?: string;
}
class ListAssistanceDto {
  @IsOptional() @IsUUID() stationId?: string;
  @IsOptional() @IsEnum(AssistanceStatus) status?: AssistanceStatus;
}
export class AssistanceActionDto {
  @IsIn(['ACCEPT', 'NOTE', 'RESOLVE', 'ESCALATE', 'CANCEL']) action:
    | 'ACCEPT'
    | 'NOTE'
    | 'RESOLVE'
    | 'ESCALATE'
    | 'CANCEL';
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) observation?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) result?: string;
}

@TerminalOnly()
@Controller('terminal/assistance')
export class TerminalAssistanceController {
  constructor(private readonly service: AssistanceService) {}
  @Post() create(
    @CurrentActor() actor: Extract<Actor, { kind: 'terminal' }>,
    @Body() dto: CreateAssistanceDto,
  ) {
    return this.service.create(actor, dto);
  }
  @Get(':id') status(
    @CurrentActor() actor: Extract<Actor, { kind: 'terminal' }>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.terminalStatus(actor, id);
  }
  @Post(':id/cancel') cancel(
    @CurrentActor() actor: Extract<Actor, { kind: 'terminal' }>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(actor, id);
  }
}

@SetMetadata('access', 'control')
@Controller('control/assistance')
export class ControlAssistanceController {
  constructor(private readonly service: AssistanceService) {}
  @Get() list(
    @CurrentActor() actor: Extract<Actor, { kind: 'control' }>,
    @Query() query: ListAssistanceDto,
  ) {
    return this.service.list(actor, query);
  }
  @Get(':id') detail(
    @CurrentActor() actor: Extract<Actor, { kind: 'control' }>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @Post(':id/actions') action(
    @CurrentActor() actor: Extract<Actor, { kind: 'control' }>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssistanceActionDto,
  ) {
    return this.service.act(actor, id, dto);
  }
}
