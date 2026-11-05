import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  SetMetadata,
} from '@nestjs/common';
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  Actor,
  CurrentActor,
  TerminalOnly,
} from '../auth/access';
import { OperationsService } from './operations.service';

class OperationDto {
  @IsUUID('4') operationId: string;
}
class ResolutionDto {
  @IsString() @MinLength(3) @MaxLength(200) reason: string;
}
class GrantDto {
  @IsUUID() userId: string;
  @IsString() @MinLength(3) @MaxLength(200) reason: string;
}
class PumpDto {
  @IsUUID() stationId: string;
  @Matches(/^[A-Z0-9-]{2,30}$/) code: string;
  @IsString() @MinLength(2) @MaxLength(80) name: string;
}
class TerminalDto {
  @IsUUID() stationId: string;
  @Matches(/^[A-Z0-9-]{2,30}$/) code: string;
}
class TerminalPumpDto {
  @IsUUID() pumpId: string;
}

const terminalId = (actor: Actor) => {
  if (actor.kind !== 'terminal') throw new Error('Terminal requerida');
  return actor.terminalId;
};
const adminId = (actor: Actor) =>
  actor.kind === 'member' ? actor.userId : undefined;

@TerminalOnly()
@Controller('terminal')
export class TerminalController {
  constructor(private readonly service: OperationsService) {}
  @Get('me') me(@CurrentActor() actor: Actor) {
    return this.service.terminalMe(terminalId(actor));
  }
  @Post('operations') open(
    @CurrentActor() actor: Actor,
    @Body() dto: OperationDto,
  ) {
    return this.service.startOperation(terminalId(actor), dto.operationId);
  }
  @Get('operations/:id') operation(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.operation(terminalId(actor), id);
  }
  @Post('operations/:id/close') close(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.closeOperation(terminalId(actor), id);
  }
}

@SetMetadata('access', 'control')
@Controller('control/terminal-operations')
export class ControlTerminalRecoveryController {
  constructor(private readonly service: OperationsService) {}

  @Post(':id/resolve') resolve(
    @CurrentActor() actor: Extract<Actor, { kind: 'control' }>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolutionDto,
  ) {
    return this.service.resolveOperation(actor.userId, id, dto.reason);
  }

  @Post(':id/cancel-unpaid') cancelUnpaid(
    @CurrentActor() actor: Extract<Actor, { kind: 'control' }>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancelUnpaidOperation(actor.userId, id);
  }
}

@SetMetadata('access', 'admin')
@Controller('operational-admin')
export class OperationalAdminController {
  constructor(private readonly service: OperationsService) {}
  @Post('permissions/admin') grant(
    @CurrentActor() actor: Actor,
    @Body() dto: GrantDto,
  ) {
    return this.service.grantAdmin(dto.userId, dto.reason, adminId(actor));
  }
  @Post('permissions/admin/:id/revoke') revokeGrant(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeAdminGrant(id, adminId(actor));
  }
  @Post('pumps') pump(@CurrentActor() actor: Actor, @Body() dto: PumpDto) {
    return this.service.createPump(
      dto.stationId,
      dto.code,
      dto.name,
      adminId(actor),
    );
  }
  @Post('terminals') terminal(
    @CurrentActor() actor: Actor,
    @Body() dto: TerminalDto,
  ) {
    return this.service.createTerminal(dto.stationId, dto.code, adminId(actor));
  }
  @Post('terminals/:id/assign-pump') assignPump(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminalPumpDto,
  ) {
    return this.service.assignTerminal(id, dto.pumpId, adminId(actor));
  }
  @Post('terminal-pump-assignments/:id/end') endPump(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.endTerminalAssignment(id, adminId(actor));
  }
  @Post('terminals/:id/revoke') revoke(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeTerminal(id, adminId(actor));
  }
}
