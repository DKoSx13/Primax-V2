import { ForbiddenException } from '@nestjs/common';
import { AdminControlPermission, Prisma, PaymentStatus, TransactionStatus, Transaction, FuelAuthorization, Station, Fuel, Vehicle, User, Payment, OperationalIncident, Receipt } from '@prisma/client';
import { receiptResponse } from '../../../../../src/receipts/receipt.service';
import { PrismaService } from '../../../../../src/prisma/prisma.service';
import type { AdministrativeActor } from '../../application/ports/administrative-lists';
type ControlActor = AdministrativeActor;

type OperationRelations = {
  receipt?: Receipt | null;
  station: Pick<Station, 'id' | 'code' | 'name'>;
  fuel: Pick<Fuel, 'name'> & Partial<Pick<Fuel, 'id' | 'code'>>;
  vehicle: (Pick<Vehicle, 'plate' | 'label'> & Partial<Pick<Vehicle, 'id'>>) | null;
  membership?: { number: string; user: Pick<User, 'id' | 'name'> } | null;
  payment: (Pick<Payment, 'status' | 'method' | 'amount' | 'refundedAmount'> & Partial<Pick<Payment, 'id'>>) | null;
  operationalIncidents: Pick<OperationalIncident, 'code' | 'status'>[];
};
type TransactionProjectionRow = Transaction & OperationRelations & {
  authorization?: Pick<FuelAuthorization, 'id' | 'status' | 'dispensedAmount' | 'dispensedGallons'> | null;
  terminalOperation?: { status: string; number: string } | null;
};
type AuthorizationProjectionRow = FuelAuthorization & OperationRelations & { terminalOperation?: { number: string } | null };

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

  protected receiptState(transaction: TransactionStatus, payment?: PaymentStatus, pending?: Prisma.Decimal) {
    if (payment === 'REFUNDED' || transaction === 'REFUNDED') return 'Reembolsado';
    if (payment === 'CANCELLED') return 'Cancelado';
    if (payment === 'REJECTED') return 'Rechazado';
    if (payment === 'ERROR') return 'Error de pago';
    if (pending?.gt(0)) return 'Saldo pendiente';
    if (payment === 'PARTIAL') return 'Saldo pendiente';
    if (payment === 'PENDING' || transaction === 'PAYMENT_PENDING') return 'Pago pendiente';
    if (transaction === 'PAID' && (!payment || payment === 'CAPTURED')) return 'Pagado';
    return 'Pago por verificar';
  }

  protected transactionProjection(row: TransactionProjectionRow, actor: ControlActor) {
    const incidents = row.operationalIncidents ?? [];
    const physicalStatus = row.authorization?.status ?? row.terminalOperation?.status ?? row.status;
    const financialStatus = row.payment?.status ?? row.status;
    return {
      id: row.id,
      transactionId: row.id,
      operationId: row.operationId,
      number: row.terminalOperation?.number ?? null,
      occurredAt: row.createdAt,
      station: row.station,
      fuel: row.fuel,
      vehicle: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? row.vehicle : null,
      plate: row.plate,
      plateEvidence: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? (row.vehicle ? 'MATCHED_REGISTERED_VEHICLE' : 'UNLINKED_PLATE') : 'PLATE_CAPTURED',
      customer: actor.permissions.includes(AdminControlPermission.ADMIN_CUSTOMER_VIEW) && row.membership ? { id: row.membership.user.id, name: row.membership.user.name, membershipNumber: row.membership.number } : null,
      mode: row.mode,
      amount: row.amount.toFixed(2),
      unitPrice: row.unitPrice.toFixed(2),
      gallons: row.gallons?.toFixed(3) ?? null,
      method: row.payment?.method ?? (row.mode === 'POSTPAGO' ? 'SALDO_PRIME' : null),
      financialStatus,
      physicalStatus,
      reviewStatus: physicalStatus === 'INTERVENTION_REQUIRED' || incidents.some((incident: { status: string }) => ['OPEN', 'IN_REVIEW'].includes(incident.status)) ? 'REVIEW' : null,
      authorization: row.authorization ? { id: row.authorization.id, status: row.authorization.status, dispensedAmount: row.authorization.dispensedAmount?.toFixed(2), dispensedGallons: row.authorization.dispensedGallons?.toFixed(3) } : null,
      incidents,
      receipt: receiptResponse(row.receipt),
      receiptType: row.receiptType,
      receiptAvailable: true,
    };
  }

  protected authorizationProjection(row: AuthorizationProjectionRow, actor: ControlActor) {
    const incidents = row.operationalIncidents ?? [];
    return {
      id: row.id,
      transactionId: null,
      operationId: row.operationId,
      number: row.terminalOperation?.number ?? null,
      occurredAt: row.createdAt,
      station: row.station,
      fuel: row.fuel,
      vehicle: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? row.vehicle : null,
      plate: row.plate,
      plateEvidence: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? (row.vehicle ? 'MATCHED_REGISTERED_VEHICLE' : 'UNLINKED_PLATE') : 'PLATE_CAPTURED',
      customer: actor.permissions.includes(AdminControlPermission.ADMIN_CUSTOMER_VIEW) && row.membership ? { id: row.membership.user.id, name: row.membership.user.name, membershipNumber: row.membership.number } : null,
      mode: row.mode,
      amount: row.payment?.amount?.toFixed(2) ?? row.authorizedAmount.toFixed(2),
      unitPrice: row.unitPrice?.toFixed(2) ?? null,
      gallons: row.dispensedGallons.toFixed(3),
      method: row.payment?.method ?? null,
      financialStatus: row.payment?.status ?? (row.status === 'INTERVENTION_REQUIRED' ? 'REVIEW' : row.status),
      physicalStatus: row.status,
      reviewStatus: row.status === 'INTERVENTION_REQUIRED' || incidents.some((incident: { status: string }) => ['OPEN', 'IN_REVIEW'].includes(incident.status)) ? 'REVIEW' : null,
      authorization: { id: row.id, status: row.status, dispensedAmount: row.dispensedAmount.toFixed(2), dispensedGallons: row.dispensedGallons.toFixed(3) },
      incidents,
      receipt: null,
      receiptType: null,
      receiptAvailable: false,
    };
  }
}
