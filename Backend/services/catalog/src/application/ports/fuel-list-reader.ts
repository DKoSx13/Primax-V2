import type { FuelReadModel } from '../fuel-read-model';

export interface FuelListReader {
  list(): Promise<FuelReadModel[]>;
}
