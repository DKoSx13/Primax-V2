import type { ListVehiclesQuery, VehicleListActor } from '../ports/list-vehicles-query';
import type { VehicleListReader } from '../ports/vehicle-list-reader';
import type { VehiclePage } from '../vehicle-read-model';

export class ListVehicles implements ListVehiclesQuery {
  constructor(private readonly reader: VehicleListReader) {}
  execute(actor: VehicleListActor, page: VehiclePage) {
    return actor.kind === 'member' ? this.reader.list(actor.userId, page) : [];
  }
}
