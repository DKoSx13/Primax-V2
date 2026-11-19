import { ForbiddenException } from '@nestjs/common';
import { AdminControlPermission, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../src/prisma/prisma.service';
import type { AdministrativeActor } from '../../application/ports/administrative-lists';
type ControlActor = AdministrativeActor;

/** Shared unchanged security/query helpers for selected and remaining legacy reads. */
export class LegacyCustomerReadContext {
  constructor(protected readonly db: PrismaService) {}
  protected async scope(actor: ControlActor, stationId: string | undefined, permission: AdminControlPermission) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException('Permiso administrativo insuficiente');
    if (typeof actor.global !== 'boolean' || !Array.isArray(actor.stationIds) ||
        actor.stationIds.some((id) => typeof id !== 'string' || !id.trim()))
      throw new ForbiddenException('Alcance de estaciones no disponible');
    if (stationId && !actor.global && !actor.stationIds.includes(stationId)) throw new ForbiddenException('Estación fuera del alcance autorizado');
    const ids = stationId ? [stationId] : actor.global ? undefined : actor.stationIds;
    if (!actor.global && ids?.length === 0) throw new ForbiddenException('No hay estaciones asignadas');
    return ids;
  }

  protected membershipStationFilter(ids?: string[]): Prisma.MembershipWhereInput {
    if (!ids) return {};
    return { OR: [
      { transactions: { some: { stationId: { in: ids } } } },
      { authorizations: { some: { stationId: { in: ids } } } },
    ] };
  }

  protected vehicleStationFilter(ids?: string[]): Prisma.VehicleWhereInput {
    if (!ids) return {};
    return { OR: [
      { transactions: { some: { stationId: { in: ids } } } },
      { authorizations: { some: { stationId: { in: ids } } } },
    ] };
  }

  protected maskEmail(email: string) {
    const [name, domain] = email.split('@');
    if (!domain) return '•••';
    return `${name.slice(0, 1)}•••@•••`;
  }
}
