import type { FuelReadModel } from './fuel-read-model';
import type { StationReadModel } from './station-read-model';

/** Read projection only; no reservation, movement or stock mutation. */
export interface InventoryReadModel {
  stationId: string;
  fuelId: string;
  liters: string | { toJSON(): string };
  reservedLiters: string | { toJSON(): string };
  updatedAt: Date | string;
  fuel: FuelReadModel;
  station: StationReadModel;
}
