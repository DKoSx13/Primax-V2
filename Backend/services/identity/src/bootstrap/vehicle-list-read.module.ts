import { Module } from '@nestjs/common';
import { VehiclesRepository } from '../../../../src/vehicles/vehicles.repository';
import { VehicleListReadAdapter } from '../adapters/inbound/vehicle-list-read.adapter';
import { ExistingVehicleListReader } from '../adapters/outbound/existing-vehicle-list.reader';
import { LIST_VEHICLES_QUERY } from '../application/ports/list-vehicles-query';
import type { VehicleListReader } from '../application/ports/vehicle-list-reader';
import { ListVehicles } from '../application/use-cases/list-vehicles';
import { LegacyVehicleLookup, LegacyVehicleView } from '../adapters/outbound/legacy-vehicle-lookup';
import { VehicleLookupAdapter } from '../adapters/inbound/vehicle-lookup.adapter';
import { VEHICLE_LOOKUP } from '../application/ports/vehicle-lookup';
import { LookupVehicle } from '../application/use-cases/lookup-vehicle';

@Module({
  providers: [VehiclesRepository, ExistingVehicleListReader,
    { provide: LIST_VEHICLES_QUERY, inject: [ExistingVehicleListReader],
      useFactory: (reader: VehicleListReader) => new ListVehicles(reader) },
    VehicleListReadAdapter, LegacyVehicleLookup,
    { provide: VEHICLE_LOOKUP, inject: [LegacyVehicleLookup],
      useFactory: (source: LegacyVehicleLookup) => new LookupVehicle<LegacyVehicleView>(source) },
    VehicleLookupAdapter],
  exports: [VehiclesRepository, VehicleListReadAdapter, VehicleLookupAdapter],
})
export class VehicleListReadModule {}
