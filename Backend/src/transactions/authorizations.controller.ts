import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AlertsService } from '../alerts/alerts.service';
import { KioskOnly } from '../auth/access';
import { AuthorizationReadsAdapter } from '../../services/commerce/src/adapters/inbound/authorization-reads.adapter';
import { CreateAuthorizationDto } from './create-authorization.dto';
import { DispenseProgressDto } from './dispense-progress.dto';
import { AuthorizationCommandsAdapter } from '../../services/commerce/src/adapters/inbound/authorization-commands.adapter';

@ApiTags('authorizations')
@Controller('authorizations')
export class AuthorizationsController {
  constructor(private readonly service: AuthorizationReadsAdapter, private readonly alerts: AlertsService,
    private readonly commands: AuthorizationCommandsAdapter) {}
  @Post()
  @KioskOnly()
  @ApiSecurity('kiosk')
  @ApiCreatedResponse({
    description: 'Reserva saldo para un abastecimiento postpago.',
  })
  @ApiConflictResponse({
    description: 'operationId reutilizado con datos distintos',
  })
  async create(@Body() dto: CreateAuthorizationDto) {
    if (dto.mode !== 'PREPAGO' && dto.membershipCode) await this.alerts.checkPlate(dto.plate, dto.membershipCode, dto.operationId);
    return this.commands.create(dto);
  }
  @Post(':id/intervention')
  @KioskOnly()
  intervention(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.commands.intervention(id);
  }
  @Post(':id/progress')
  @KioskOnly()
  @ApiSecurity('kiosk')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Avance validado del abastecimiento. El cierre debe coincidir con este registro.',
  })
  progress(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DispenseProgressDto,
  ) {
    return this.commands.progress(id, dto);
  }
  @Get(':id')
  @KioskOnly()
  @ApiSecurity('kiosk')
  @ApiOkResponse({
    description:
      'Estado de la reserva, para recuperar una operación interrumpida.',
  })
  status(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.status(id);
  }
  @Get()
  @KioskOnly()
  @ApiSecurity('kiosk')
  @ApiOkResponse({
    description:
      'Reservas antiguas sin liquidar, solo para revisión. No las libera.',
  })
  pending(
    @Query('olderThanMinutes', new ParseIntPipe()) olderThanMinutes: number,
  ) {
    if (!Number.isInteger(olderThanMinutes) || olderThanMinutes < 1)
      throw new BadRequestException(
        'olderThanMinutes debe ser un entero positivo',
      );
    return this.service.pendingBefore(olderThanMinutes);
  }
  @Post(':id/release')
  @KioskOnly()
  @ApiSecurity('kiosk')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Reserva liberada sin consumo.' })
  release(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.commands.release(id);
  }
}
