import { CanActivate, Controller, ExecutionContext, Get, Inject, Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import { timingSafeEqual, createHash } from 'node:crypto';
import { Catalog } from '../application/catalog';

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
  @Get('stations') stations() { return this.catalog.stations(); }
  @Get('benefits') benefits() { return this.catalog.benefits(); }
  @Get('fuels/inventory') inventory() { return this.catalog.inventory(); }
}
@Controller('health')
export class HealthController {
  constructor(private readonly catalog: Catalog) {}
  @Get() live() { return { status: 'ok', service: 'catalog' }; }
  @Get('ready') async ready() { await this.catalog.ready(); return this.live(); }
}
