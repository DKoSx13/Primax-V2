import { Injectable, ServiceUnavailableException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Actor } from '../auth/access';

/** Called only after AuthCore resolves CurrentActor; public query parameters are ignored. */
export function scopeCatalog<T>(rows: T[], actor: Actor | undefined, station: (row: T) => string): T[] {
  if (actor?.kind === 'kiosk' || actor?.kind === 'terminal') {
    if (!actor.stationId) throw new ForbiddenException('Station required');
    return rows.filter(row => station(row) === actor.stationId);
  }
  if (actor?.kind === 'control' && !actor.global) {
    return rows.filter(row => actor.stationIds.includes(station(row)));
  }
  return rows;
}
@Injectable()
export class CatalogReader {
  constructor(private readonly config: ConfigService) {}
  enabled() { return this.config.get('CATALOG_READ_ADAPTER') === 'http'; }
  async read<T>(route: string): Promise<T> {
    const origin = this.config.get<string>('CATALOG_INTERNAL_URL');
    const key = this.config.get<string>('CATALOG_API_KEY');
    if (!origin || !key || key.length < 32) throw new ServiceUnavailableException('Catalog configuration missing');
    try {
      const response = await fetch(new URL('/api/v1/' + route, origin), {
        headers: { 'x-catalog-key': key }, signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (!response.ok) throw Error('Catalog unavailable');
      const rows = await response.json();
      if (!Array.isArray(rows)) throw Error('Invalid Catalog response');
      return rows as T;
    } catch { throw new ServiceUnavailableException('Catalog unavailable'); }
  }
}
