import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  SetMetadata,
  ForbiddenException,
  Header,
} from '@nestjs/common';
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { IsOptional } from 'class-validator';
import {
  Actor,
  CurrentActor,
  TerminalOnly,
} from '../auth/access';
import { OperationsService } from './operations.service';
import { KioskService } from '../kiosk/kiosk.service';

class OperationDto {
  @IsUUID('4') operationId: string;
}
class TerminalClaimDto {
  @IsOptional() @IsUUID('4') operationId?: string;
}
class ResolutionDto {
  @IsString() @MinLength(3) @MaxLength(200) reason: string;
}
class RecoveryDto {
  @IsString() @MinLength(10) @MaxLength(200) reason: string;
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
  constructor(private readonly service: OperationsService, private readonly kiosk: KioskService) {}
  @Post('claim') claim(@CurrentActor() actor: Actor, @Req() req: Request, @Body() dto: TerminalClaimDto) {
    return this.kiosk.claimTerminal(req, terminalId(actor), dto.operationId);
  }
  @Get('me') async me(@CurrentActor() actor: Actor, @Req() req: Request) {
    await this.kiosk.touchTerminalOwner(terminalId(actor), req.header('x-terminal-owner') || '');
    return this.service.terminalMe(terminalId(actor), actor.kind === 'terminal' ? actor.credentialId : undefined);
  }
  @Post('operations') async open(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Body() dto: OperationDto,
  ) {
    if (actor.kind === 'terminal' && actor.recoveredOperationId)
      throw new ForbiddenException('La recuperación no permite abrir operaciones');
    await this.kiosk.assertTerminalOwner(terminalId(actor), req.header('x-terminal-owner') || '', true);
    return this.service.startOperation(terminalId(actor), dto.operationId);
  }
  @Get('operations/:id') async operation(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (actor.kind === 'terminal' && actor.recoveredOperationId && actor.recoveredOperationId !== id)
      throw new ForbiddenException('Credencial limitada a otra operación');
    await this.kiosk.assertTerminalOwner(terminalId(actor), req.header('x-terminal-owner') || '');
    return this.service.operation(terminalId(actor), id);
  }
  @Get('operations/:id/recovery-state') async recoveryState(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (actor.kind !== 'terminal' || actor.recoveredOperationId !== id)
      throw new ForbiddenException('Estado disponible solo para la operación recuperada');
    await this.kiosk.assertTerminalOwner(terminalId(actor), req.header('x-terminal-owner') || '');
    return this.service.recoveryState(terminalId(actor), id);
  }
  @Post('operations/:id/close') async close(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (actor.kind === 'terminal' && actor.recoveredOperationId && actor.recoveredOperationId !== id)
      throw new ForbiddenException('Credencial limitada a otra operación');
    await this.kiosk.assertTerminalOwner(terminalId(actor), req.header('x-terminal-owner') || '');
    const result = await this.service.closeOperation(terminalId(actor), id);
    if (actor.kind === 'terminal' && actor.recoveredOperationId === id && result.closedAt)
      await this.kiosk.releaseClosedRecovery(actor.terminalId, id, req.header('x-terminal-owner') || '');
    return result;
  }
}

@SetMetadata('access', 'control')
@Controller('control/terminal-operations')
export class ControlTerminalRecoveryController {
  constructor(private readonly service: OperationsService, private readonly kiosk: KioskService) {}

  @Post(':id/recovery-ticket') @Header('Cache-Control', 'no-store') async recoveryTicket(
    @CurrentActor() actor: Extract<Actor, { kind: 'control' }>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecoveryDto,
  ) {
    try { return await this.kiosk.issueRecoveryTicket(actor, id, dto.reason.trim()); }
    catch (error) { await this.kiosk.auditRecoveryDenied(actor, id, dto.reason.trim(), error).catch(() => undefined); throw error; }
  }

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
