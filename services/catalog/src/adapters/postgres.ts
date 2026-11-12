import { Pool, PoolClient } from 'pg';
import { CatalogReader } from '../application/catalog';
import { Benefit, Fuel, Inventory, Station } from '../domain/catalog';

const fuelColumns = 'id, code, name, "pricePerGallon", active, "createdAt", "updatedAt"';
const stationColumns = 'id, code, name, address, active, "createdAt", "updatedAt"';
const decimal = (value: string) => value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
const fuel = (row: Fuel): Fuel => ({ ...row, pricePerGallon: decimal(row.pricePerGallon) });

export class PostgresCatalog implements CatalogReader {
  constructor(private readonly pool: Pool) {}
  private async read<T>(query: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await query(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  fuels() {
    return this.read(async c => (await c.query<Fuel>(`SELECT ${fuelColumns} FROM "Fuel" WHERE active ORDER BY code`)).rows.map(fuel));
  }
  stations() {
    return this.read(async c => (await c.query<Station>(`SELECT ${stationColumns} FROM "Station" WHERE active ORDER BY code`)).rows);
  }
  benefits() {
    return this.read(async c => (await c.query<Benefit>('SELECT id, code, title, description, category, "pointsCost", active, "createdAt", "updatedAt" FROM "Benefit" WHERE active ORDER BY code')).rows);
  }
  inventory() {
    return this.read(async c => {
      const rows = (await c.query<Omit<Inventory, 'fuel' | 'station'>>('SELECT "stationId", "fuelId", liters, "reservedLiters", "updatedAt" FROM "FuelInventory" ORDER BY "stationId", "fuelId"')).rows;
      const fuels = new Map((await c.query<Fuel>(`SELECT ${fuelColumns} FROM "Fuel"`)).rows.map(r => [r.id, fuel(r)]));
      const stations = new Map((await c.query<Station>(`SELECT ${stationColumns} FROM "Station"`)).rows.map(r => [r.id, r]));
      return rows.map(row => {
        const f = fuels.get(row.fuelId), s = stations.get(row.stationId);
        if (!f || !s) throw Error('Catalog projection integrity failure');
        return { ...row, liters: decimal(row.liters), reservedLiters: decimal(row.reservedLiters), fuel: f, station: s };
      });
    });
  }
  async ready() { await this.read(c => c.query('SELECT 1 FROM "Fuel" LIMIT 1')); }
}
