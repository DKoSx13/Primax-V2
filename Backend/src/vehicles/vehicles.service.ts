import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { CreateVehicleDto } from './create-vehicle.dto';
import { Actor } from '../auth/access';
import { PaginationDto } from '../common/pagination.dto';
import { normalizePlate } from './plate.dto';
import { VehiclesRepository } from './vehicles.repository';
import { VehicleListReadAdapter } from '../../services/identity/src/adapters/inbound/vehicle-list-read.adapter';
import { VehicleLookupAdapter } from '../../services/identity/src/adapters/inbound/vehicle-lookup.adapter';
@Injectable()
export class VehiclesService {
  constructor(private readonly repo: VehiclesRepository, private readonly vehicleList: VehicleListReadAdapter, private readonly lookup: VehicleLookupAdapter) {}
  membership(number: string) { return this.repo.membership(number); }
  async create(dto: CreateVehicleDto, actor: Actor) {
    if (actor.kind !== 'member') throw new ForbiddenException();
    const plate = normalizePlate(dto.plate) as string;
    await this.repo.link(actor.userId, plate, dto.label);
    return this.findByPlate(plate, actor);
  }
  async findByPlate(plate: string, actor: Actor) { return this.lookup.findByPlate(plate, actor); }
  list(actor: Actor, query: PaginationDto) {
    return this.vehicleList.list(actor, query);
  }
}
