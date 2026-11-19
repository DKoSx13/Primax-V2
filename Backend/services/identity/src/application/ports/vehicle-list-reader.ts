import type { VehiclePage, VehicleReadModel } from '../vehicle-read-model';

export interface VehicleListReader {
  list(ownerUserId: string, page: VehiclePage): Promise<VehicleReadModel[]>;
}
