import { BadRequestException, Query, CanActivate, Controller, ExecutionContext, Get, Inject, Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import { timingSafeEqual, createHash } from 'node:crypto';
import { Catalog } from '../application/catalog';

// Internal scope must be supplied by a trusted, authenticated facade.
function stationScope(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(value)) {
    throw new BadRequestException('Invalid stationId');
  }
  return value;
}

export const API_KEY = Symbol('Catalog internal API key');
@Injectable()
export class ServiceGuard implements CanActivate {
  constructor(@Inject(API_KEY) private readonly key: string) {}
  canActivate(context: ExecutionContext): boolean {
    const supplied = context.switchToHttp().getRequest().headers['x-catalog-key'];
    if (typeof supplied !== 'string' || !timingSafeEqual(
      createHash('sha256').update(supplied).digest(), createHash('sha256').update(this.key).digest(),
    )) throw new UnauthorizedException();
    return true;
  }
}
@Controller('api/v1')
@UseGuards(ServiceGuard)
export class CatalogController {
  constructor(private readonly catalog: Catalog) {}
  @Get('fuels') fuels() { return this.catalog.fuels(); }
  @Get('stations') stations(@Query('stationId') stationId?: unknown) { return this.catalog.stations(stationScope(stationId)); }
  @Get('benefits') benefits() { return this.catalog.benefits(); }
  @Get('fuels/inventory') inventory(@Query('stationId') stationId?: unknown) { return this.catalog.inventory(stationScope(stationId)); }
}
@Controller('health')
export class HealthController {
  constructor(private readonly catalog: Catalog) {}
  @Get() live() { return { status: 'ok', service: 'catalog' }; }
  @Get('ready') async ready() { await this.catalog.ready(); return this.live(); }
}
