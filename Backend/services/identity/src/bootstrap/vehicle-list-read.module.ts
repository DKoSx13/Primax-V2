import { Module } from '@nestjs/common';
import { VehiclesRepository } from '../../../../src/vehicles/vehicles.repository';
import { VehicleListReadAdapter } from '../adapters/inbound/vehicle-list-read.adapter';
import { ExistingVehicleListReader } from '../adapters/outbound/existing-vehicle-list.reader';
import { LIST_VEHICLES_QUERY } from '../application/ports/list-vehicles-query';
import type { VehicleListReader } from '../application/ports/vehicle-list-reader';
import { ListVehicles } from '../application/use-cases/list-vehicles';

@Module({
  providers: [VehiclesRepository, ExistingVehicleListReader,
    { provide: LIST_VEHICLES_QUERY, inject: [ExistingVehicleListReader],
      useFactory: (reader: VehicleListReader) => new ListVehicles(reader) },
    VehicleListReadAdapter],
  exports: [VehiclesRepository, VehicleListReadAdapter],
})
export class VehicleListReadModule {}
