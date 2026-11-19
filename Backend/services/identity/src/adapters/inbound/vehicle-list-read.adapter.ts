import { Inject, Injectable } from '@nestjs/common';
import { LIST_VEHICLES_QUERY } from '../../application/ports/list-vehicles-query';
import type { ListVehiclesQuery, VehicleListActor } from '../../application/ports/list-vehicles-query';
import type { VehiclePage } from '../../application/vehicle-read-model';

@Injectable()
export class VehicleListReadAdapter {
  constructor(@Inject(LIST_VEHICLES_QUERY) private readonly query: ListVehiclesQuery) {}
  list(actor: VehicleListActor, page: VehiclePage) { return this.query.execute(actor, page); }
}
