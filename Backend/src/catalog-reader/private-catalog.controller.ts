import { Controller, ForbiddenException, Get, Header, Query, SetMetadata } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { Actor, CurrentActor } from '../auth/access';
import { FuelsService } from '../fuels/fuels.service';
import { StationsService } from '../stations/stations.service';
import { scopeCatalog } from './catalog-reader';
class StationFilter {
  @IsOptional() @IsUUID() stationId?: string;
}
/** Operational inventory view: reuses Control's existing permission and station scope. */
@Controller('control/catalog')
@SetMetadata('access', 'control')
export class PrivateCatalogController {
  constructor(private readonly fuels: FuelsService, private readonly stations: StationsService) {}
  private authorize(actor: Actor, stationId?: string) {
    if (actor.kind !== 'control' || !actor.permissions.includes('ADMIN_INVENTORY_VIEW')) {
      throw new ForbiddenException('Permiso administrativo insuficiente');
    }
    if (!actor.global && actor.stationIds.length === 0) throw new ForbiddenException('No hay estaciones asignadas');
    if (stationId && !actor.global && !actor.stationIds.includes(stationId)) {
      throw new ForbiddenException('Estación fuera de alcance');
    }
  }
  @Header('Cache-Control', 'no-store')
  @Get('inventory') async inventory(@CurrentActor() actor: Actor, @Query() query: StationFilter) {
    this.authorize(actor, query.stationId);
    const rows = scopeCatalog(await this.fuels.inventory(), actor, row => row.stationId);
    return query.stationId ? rows.filter(row => row.stationId === query.stationId) : rows;
  }
  @Get('stations') async list(@CurrentActor() actor: Actor, @Query() query: StationFilter) {
    this.authorize(actor, query.stationId);
    const rows = scopeCatalog(await this.stations.list(), actor, row => row.id);
    return query.stationId ? rows.filter(row => row.id === query.stationId) : rows;
  }
}
