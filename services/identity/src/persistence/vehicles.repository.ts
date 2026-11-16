import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { IdentityDatabase } from "./identity-db";
import { PaginationDto } from "../compatibility/common/pagination.dto";

@Injectable()
export class VehiclesRepository {
  constructor(private readonly db: IdentityDatabase) {}
  link(userId: string, plate: string, label: string) {
    return this.db.atomic(async (tx) => {
      const member = await tx.membership.findUnique({
        where: { userId },
        include: { user: { select: { active: true } } },
      });
      if (!member || member.status !== "ACTIVE" || !member.user.active)
        throw new ForbiddenException("Membresía no disponible");
      const existing = await tx.vehicle.findUnique({ where: { plate } });
      if (existing?.membershipId && existing.membershipId !== member.id)
        throw new ConflictException(
          "El vehículo ya está vinculado a otra membresía",
        );
      if (existing?.membershipId === member.id) return existing;
      return existing
        ? tx.vehicle.update({
            where: { id: existing.id },
            data: { membershipId: member.id, label },
          })
        : tx.vehicle.create({
            data: { plate, label, membershipId: member.id },
          });
    });
  }
  list(userId: string, query: PaginationDto) {
    return this.db.vehicle.findMany({
      where: { membership: { userId } },
      orderBy: { plate: "asc" },
      take: query.limit,
      skip: (query.page - 1) * query.limit,
    });
  }
  async membership(number: string) {
    const select = {
      number: true,
      status: true,
      vehicles: { select: { plate: true } },
    } as const;
    const direct = await this.db.membership.findUnique({
      where: { number },
      select,
    });
    if (direct) return direct;
    const alias = await this.db.membershipCodeAlias.findUnique({
      where: { code: number },
      include: { membership: { select } },
    });
    return alias?.membership ?? null;
  }
}
