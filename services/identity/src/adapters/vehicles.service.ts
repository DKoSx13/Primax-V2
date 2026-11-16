import { ForbiddenException, Injectable } from "@nestjs/common";
import { VehiclesRepository } from "../persistence/vehicles.repository";
import { Actor } from "../compatibility/auth/access";
import { CreateVehicleDto } from "../compatibility/vehicles/create-vehicle.dto";
import { normalizePlate } from "../compatibility/vehicles/plate.dto";
import { PaginationDto } from "../compatibility/common/pagination.dto";
import { RemoteFinancialReads } from "./financial-reads";

@Injectable()
export class VehiclesService {
  constructor(
    private readonly repo: VehiclesRepository,
    private readonly finance: RemoteFinancialReads,
  ) {}
  membership(number: string) {
    return this.repo.membership(number);
  }
  async create(dto: CreateVehicleDto, actor: Actor) {
    if (actor.kind !== "member") throw new ForbiddenException();
    const plate = normalizePlate(dto.plate) as string;
    await this.repo.link(actor.userId, plate, dto.label);
    return this.findByPlate(plate, actor);
  }
  findByPlate(plate: string, actor: Actor) {
    return this.finance.vehicleView(normalizePlate(plate) as string, actor);
  }
  list(actor: Actor, query: PaginationDto) {
    return actor.kind === "member" ? this.repo.list(actor.userId, query) : [];
  }
}
