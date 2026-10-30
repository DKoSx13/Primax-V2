import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, SetMetadata, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { Request } from 'express';
import { Actor, CurrentActor, Public } from '../auth/access';
import { KioskService } from '../kiosk/kiosk.service';
import { KioskStore } from '../kiosk/redis-store';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsService } from './operations.service';

type ControlActor = Extract<Actor, { kind: 'control' }>;
const supervisorId = (actor: ControlActor) => actor.userId;
const ticketKey = (store: KioskStore, token: string) =>
  store.key(`control-handoff:${createHash('sha256').update(token).digest('hex')}`);

class HandoffDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) ticket: string;
}

@SetMetadata('access', 'control')
@Controller('control/supervisor')
export class ControlStationController {
  constructor(private readonly operations: OperationsService, private readonly store: KioskStore) {}

  @Get('stations') stations(@CurrentActor() actor: ControlActor) {
    return this.operations.stations(supervisorId(actor));
  }
  @Get('shift') async shift(@CurrentActor() actor: ControlActor) {
    return { shift: await this.operations.currentShift(supervisorId(actor)) };
  }
  @Get('stations/:id/shift') async stationShift(@CurrentActor() actor: ControlActor, @Param('id', ParseUUIDPipe) stationId: string) {
    const stations = await this.operations.stations(supervisorId(actor));
    if (!stations.some((station) => station.stationId === stationId)) throw new ForbiddenException('Supervisor no asignado a esta estación');
    return { shift: await this.operations.currentShift(supervisorId(actor), stationId) };
  }
  @Post('stations/:id/shifts') open(@CurrentActor() actor: ControlActor, @Param('id', ParseUUIDPipe) stationId: string) {
    return this.operations.openShift(supervisorId(actor), stationId);
  }
  @Post('shifts/:id/close') close(@CurrentActor() actor: ControlActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.operations.shiftState(supervisorId(actor), id, 'close');
  }
  @Get('stations/:id/terminals') terminals(@CurrentActor() actor: ControlActor, @Param('id', ParseUUIDPipe) stationId: string) {
    return this.operations.terminals(supervisorId(actor), stationId);
  }
  @Post('terminals/:id/start') async start(@CurrentActor() actor: ControlActor, @Param('id', ParseUUIDPipe) terminalId: string) {
    const result = await this.operations.prepareStation(supervisorId(actor), terminalId);
    const ticket = randomBytes(32).toString('base64url');
    const stored = await this.store.command<string>('SET', ticketKey(this.store, ticket), JSON.stringify({ userId: actor.userId, stationId: result.stationId, terminalId }), 'EX', 90, 'NX');
    if (stored !== 'OK') throw new UnauthorizedException('No se pudo preparar la estación. Intenta nuevamente o contacta al administrador.');
    return { ...result, handoffTicket: ticket, handoffExpiresInSeconds: 90 };
  }
}

@Public()
@Controller('kiosk/session')
export class StationHandoffController {
  constructor(
    private readonly operations: OperationsService,
    private readonly kiosk: KioskService,
    private readonly store: KioskStore,
    private readonly db: PrismaService,
  ) {}

  @Post('control-handoff') async redeem(@Req() req: Request, @Body() body: HandoffDto) {
    this.kiosk.verifyGateway(req);
    await this.kiosk.limitTechnical(req);
    const raw = await this.store.command<string | null>('GETDEL', ticketKey(this.store, body.ticket));
    if (!raw) throw new UnauthorizedException('La preparación venció. Inicia la estación nuevamente.');
    let handoff: { userId: string; stationId: string; terminalId: string };
    try { handoff = JSON.parse(raw); }
    catch { throw new UnauthorizedException('Preparación inválida'); }
    const state = await this.operations.prepareStation(handoff.userId, handoff.terminalId);
    if (state.stationId !== handoff.stationId) throw new ForbiddenException('Estación no autorizada');
    const session = await this.kiosk.handoffSupervisor(handoff.userId, handoff.stationId);
    const previous = req.header('x-terminal-session') || '';
    const active = /^[a-f0-9]{64}$/.test(previous) ? await this.db.terminalCredential.findUnique({
      where: { tokenHash: createHash('sha256').update(previous).digest('hex') },
    }) : null;
    const credential = active?.terminalId === handoff.terminalId && !active.revokedAt && active.expiresAt > new Date()
      ? { token: previous, expiresAt: active.expiresAt, terminalId: handoff.terminalId }
      : await this.operations.issueCredential(handoff.userId, handoff.terminalId, true);
    return { ...session, terminalToken: credential.token, terminalId: credential.terminalId, terminalExpiresAt: credential.expiresAt };
  }
}
