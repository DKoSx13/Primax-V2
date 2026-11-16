import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { Public } from '../auth/access';
import { KioskService } from './kiosk.service';

class OperatorLogin {
  @IsString() @MinLength(1) @MaxLength(80) username: string;
  @IsString() @MinLength(1) @MaxLength(72) password: string;
}
class TargetOperation {
  @IsIn(['GET', 'POST']) method: string;
  @IsString() @MaxLength(200) path: string;
  @IsOptional() @IsObject() body?: Record<string, unknown>;
}
class TerminalBootstrapDto {
  @IsOptional() @IsUUID() terminalId?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z0-9-]{3,30}$/) terminalCode?: string;
}
class TerminalRecoveryDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) ticket: string;
  @IsString() @Matches(/^[A-Z0-9-]{3,30}$/) terminalCode: string;
}
@Public()
@Controller('kiosk/session')
export class KioskController {
  constructor(private readonly service: KioskService) {}
  @Get() status(@Req() req: Request) {
    return this.service.status(req);
  }
  @Post('login') login(@Req() req: Request, @Body() body: OperatorLogin) {
    return this.service.login(req, body);
  }
  @Post('terminal-bootstrap') terminalBootstrap(@Req() req: Request, @Body() body: TerminalBootstrapDto) {
    return this.service.bootstrapTerminal(req, body.terminalId, body.terminalCode);
  }
  @Post('terminal-recovery') terminalRecovery(@Req() req: Request, @Body() body: TerminalRecoveryDto) {
    return this.service.exchangeRecoveryTicket(req, body.ticket, body.terminalCode);
  }
  @Post('logout') logout(@Req() req: Request) {
    return this.service.logout(req);
  }
  @Post('authorize') async authorize(
    @Req() req: Request,
    @Body() body: TargetOperation,
  ) {
    const actor = await this.service.authorize(req, body);
    return { allowed: true, stationId: actor.stationId };
  }
}
