import { Injectable } from '@nestjs/common';
import { AdminControlPermission } from '@prisma/client';
import { PrismaService } from '../../../../../src/prisma/prisma.service';
import type { AdministrativeActor, AdministrativeFilters } from '../../application/ports/administrative-lists';
import { LegacyCustomerReadContext } from './legacy-customer-context';
type ControlActor = AdministrativeActor;
type Filter = AdministrativeFilters;
@Injectable()
export class LegacyAdministrativeLists extends LegacyCustomerReadContext {
  constructor(db: PrismaService) { super(db); }
  async customers(actor: ControlActor, filters: Filter) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_CUSTOMER_VIEW);
    const q = filters.q?.trim();
    const members = await this.db.membership.findMany({
      where: {
        AND: [this.membershipStationFilter(ids), ...(q ? [{ OR: [
          { number: { contains: q, mode: 'insensitive' as const } },
          { user: { name: { contains: q, mode: 'insensitive' as const } } },
          { user: { email: { contains: q, mode: 'insensitive' as const } } },
          { vehicles: { some: { plate: { contains: q, mode: 'insensitive' as const }, ...this.vehicleStationFilter(ids) } } },
        ] }] : [])],
      },
      include: {
        user: { select: { id: true, name: true, email: true, active: true, createdAt: true } },
        vehicles: { where: this.vehicleStationFilter(ids), select: { id: true, plate: true, label: true } },
        transactions: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        authorizations: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const canMembership = actor.permissions.includes(AdminControlPermission.ADMIN_MEMBERSHIP_VIEW);
    return members.filter((membership) => membership.user.active).map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
      email: actor.global ? membership.user.email : this.maskEmail(membership.user.email),
      active: membership.user.active,
      registeredAt: membership.user.createdAt,
      membership: canMembership ? {
        id: membership.id,
        number: membership.number,
        status: membership.status,
        ...(actor.global ? { balance: membership.balance.toFixed(2) } : {}),
      } : null,
      vehicles: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? membership.vehicles : [],
      lastActivityAt: [membership.transactions[0]?.createdAt, membership.authorizations[0]?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
    }));
  }

  async memberships(actor: ControlActor, filters: Filter) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_MEMBERSHIP_VIEW);
    const q = filters.q?.trim();
    const rows = await this.db.membership.findMany({
      where: {
        AND: [this.membershipStationFilter(ids), ...(q ? [{ OR: [{ number: { contains: q, mode: 'insensitive' as const } }, { user: { name: { contains: q, mode: 'insensitive' as const } } }, { user: { email: { contains: q, mode: 'insensitive' as const } } }] }] : [])],
        ...(filters.status ? { status: filters.status as 'ACTIVE' | 'SUSPENDED' } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true, active: true } }, transactions: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } }, authorizations: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return rows.map((row) => ({ id: row.id, number: row.number, status: row.status, customer: { id: row.user.id, name: row.user.name, email: actor.global ? row.user.email : this.maskEmail(row.user.email) }, ...(actor.global ? { balance: row.balance.toFixed(2) } : {}), createdAt: row.createdAt, lastActivityAt: [row.transactions[0]?.createdAt, row.authorizations[0]?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null }));
  }

  async vehicles(actor: ControlActor, filters: Filter) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_VEHICLE_VIEW);
    const q = filters.q?.trim();
    const rows = await this.db.vehicle.findMany({
      where: { AND: [
        ...(q ? [{ OR: [{ plate: { contains: q, mode: 'insensitive' as const } }, { label: { contains: q, mode: 'insensitive' as const } }, { membership: { is: { user: { name: { contains: q, mode: 'insensitive' as const } } } } }] }] : []),
        ...(ids ? [this.vehicleStationFilter(ids)] : []),
      ] },
      include: { membership: { select: { id: true, number: true, status: true, user: { select: { id: true, name: true } } } }, transactions: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, plate: true, createdAt: true, station: { select: { id: true, code: true, name: true } } } }, authorizations: { where: ids ? { stationId: { in: ids } } : {}, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, plate: true, createdAt: true, station: { select: { id: true, code: true, name: true } } } } },
      orderBy: { updatedAt: 'desc' }, take: 100,
    });
    return rows.map((row) => ({ id: row.id, plate: row.plate, label: row.label, status: 'REGISTERED', customer: row.membership ? { id: row.membership.user.id, name: row.membership.user.name } : null, membership: row.membership ? { number: row.membership.number, status: row.membership.status } : null, lastActivityAt: [row.transactions[0]?.createdAt, row.authorizations[0]?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null, plateEvidence: row.transactions[0] || row.authorizations[0] ? 'REGISTRATION_USED_IN_OPERATION' : 'REGISTERED' }));
  }
}
export type LegacyAdministrativeViews = {
  customers: Awaited<ReturnType<LegacyAdministrativeLists['customers']>>;
  memberships: Awaited<ReturnType<LegacyAdministrativeLists['memberships']>>;
  vehicles: Awaited<ReturnType<LegacyAdministrativeLists['vehicles']>>;
};
