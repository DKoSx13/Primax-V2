import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { AdminControlPermission, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../src/prisma/prisma.service';
import type { AdministrativeActor } from '../../application/ports/administrative-lists';
import { LegacyCustomerReadContext } from './legacy-customer-context';
type ControlActor = AdministrativeActor;
@Injectable()
export class LegacyAdministrativeDetails extends LegacyCustomerReadContext {
  constructor(db: PrismaService) { super(db); }
  async customer(actor: ControlActor, userId: string) {
    const ids = await this.scope(actor, undefined, AdminControlPermission.ADMIN_CUSTOMER_VIEW);
    const membership = await this.db.membership.findFirst({
      where: { userId, ...this.membershipStationFilter(ids) },
      include: {
        user: { select: { id: true, name: true, email: true, active: true, createdAt: true } },
        vehicles: { where: this.vehicleStationFilter(ids), select: { id: true, plate: true, label: true } },
      },
    });
    if (!membership) throw new NotFoundException('Cliente no encontrado en el alcance autorizado');
    const [points, transactions, authorizations] = await Promise.all([
      actor.permissions.includes(AdminControlPermission.ADMIN_MEMBERSHIP_VIEW)
        ? this.db.rewardMovement.aggregate({ where: { membershipId: membership.id }, _sum: { points: true } })
        : Promise.resolve({ _sum: { points: null } }),
      actor.permissions.includes(AdminControlPermission.ADMIN_OPERATION_VIEW)
        ? this.db.transaction.findMany({
            where: { membershipId: membership.id, ...(ids ? { stationId: { in: ids } } : {}) },
            include: { receipt: true, terminalOperation: { select: { number: true, status: true } }, station: { select: { id: true, code: true, name: true } }, fuel: { select: { name: true } }, vehicle: { select: { plate: true, label: true } }, payment: { select: { status: true, method: true, amount: true, refundedAmount: true } }, operationalIncidents: { select: { code: true, status: true } } },
            orderBy: { createdAt: 'desc' }, take: 50,
          })
        : Promise.resolve([]),
      actor.permissions.includes(AdminControlPermission.ADMIN_OPERATION_VIEW)
        ? this.db.fuelAuthorization.findMany({
            where: { membershipId: membership.id, ...(ids ? { stationId: { in: ids } } : {}), transaction: null },
            include: { terminalOperation: { select: { number: true, status: true } }, station: { select: { id: true, code: true, name: true } }, fuel: { select: { name: true } }, vehicle: { select: { plate: true, label: true } }, payment: { select: { status: true, method: true, amount: true, refundedAmount: true } }, operationalIncidents: { select: { code: true, status: true } } },
            orderBy: { createdAt: 'desc' }, take: 50,
          })
        : Promise.resolve([]),
    ]);
    const recent = [
      ...transactions.map((row) => this.transactionProjection(row, actor)),
      ...authorizations.map((row) => this.authorizationProjection(row, actor)),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 50);
    const canMembership = actor.permissions.includes(AdminControlPermission.ADMIN_MEMBERSHIP_VIEW);
    return {
      id: membership.user.id,
      name: membership.user.name,
      email: actor.global ? membership.user.email : this.maskEmail(membership.user.email),
      active: membership.user.active,
      registeredAt: membership.user.createdAt,
      membership: canMembership ? {
        id: membership.id,
        number: membership.number,
        status: membership.status,
        createdAt: membership.createdAt,
        ...(actor.global ? { balance: membership.balance.toFixed(2), points: points._sum.points ?? 0 } : {}),
      } : null,
      vehicles: actor.permissions.includes(AdminControlPermission.ADMIN_VEHICLE_VIEW) ? membership.vehicles : [],
      operations: recent,
    };
  }

  async membership(actor: ControlActor, membershipId: string) {
    await this.scope(actor, undefined, AdminControlPermission.ADMIN_MEMBERSHIP_VIEW);
    const row = await this.db.membership.findUnique({ where: { id: membershipId }, select: { userId: true } });
    if (!row) throw new NotFoundException('Membresía no encontrada');
    const customer = await this.customer({ ...actor, permissions: [...actor.permissions, AdminControlPermission.ADMIN_CUSTOMER_VIEW] }, row.userId);
    if (!customer.membership) throw new NotFoundException('Membresía no encontrada en el alcance autorizado');
    return customer.membership;
  }

  async transaction(actor: ControlActor, transactionId: string) {
    const row = await this.db.transaction.findUnique({ where: { id: transactionId }, include: { receipt: true, terminalOperation: { select: { number: true, status: true } }, station: { select: { id: true, code: true, name: true } }, fuel: { select: { id: true, code: true, name: true } }, vehicle: { select: { id: true, plate: true, label: true } }, membership: { select: { id: true, number: true, user: { select: { id: true, name: true } } } }, payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } }, authorization: { select: { id: true, status: true, mode: true, dispensedAmount: true, dispensedGallons: true } }, operationalIncidents: { select: { id: true, code: true, status: true, summary: true } } } });
    if (!row) throw new NotFoundException('Transacción no encontrada');
    await this.scope(actor, row.stationId, AdminControlPermission.ADMIN_TRANSACTION_VIEW);
    return this.transactionProjection(row, actor);
  }

  async receipt(actor: ControlActor, transactionId: string) {
    const row = await this.db.transaction.findUnique({ where: { id: transactionId }, include: { receipt: true, station: { select: { id: true, name: true } }, fuel: { select: { name: true } }, vehicle: { select: { plate: true } }, terminal: { select: { code: true } }, pump: { select: { code: true } }, payment: { select: { status: true, method: true } }, debt: { select: { amountPending: true } } } });
    if (!row) throw new NotFoundException('Comprobante no encontrado');
    await this.scope(actor, row.stationId, AdminControlPermission.ADMIN_RECEIPT_VIEW);
    if (!row.gallons?.gt(0) || !row.plate)
      throw new ConflictException('La operación no contiene cantidad y placa confirmadas para emitir una copia del comprobante.');
    return {
      schemaVersion: 2,
      id: row.receipt?.id ?? row.id,
      transactionId: row.id,
      number: row.receipt?.number ?? null,
      documentType: row.receiptType,
      demo: true,
      issuedAt: (row.receipt?.issuedAt ?? row.createdAt).toISOString(),
      station: row.station.name,
      pump: row.pump?.code ?? null,
      plate: row.plate,
      dni: row.receiptType === 'BOLETA' ? row.receiptDni || '' : '',
      ruc: row.receiptType === 'FACTURA' ? row.receiptRuc || '' : '',
      businessName: row.receiptType === 'FACTURA' ? row.receiptBusinessName || '' : '',
      fuel: row.fuel.name,
      gallons: row.gallons?.toFixed(3) ?? '0.000',
      unitPrice: row.unitPrice.toFixed(2),
      subtotal: (row.originalAmount ?? row.amount).toFixed(2),
      discount: row.discountAmount.toFixed(2),
      total: row.amount.toFixed(2),
      mode: row.mode,
      paymentMethod: row.payment?.method ?? (row.mode === 'POSTPAGO' ? 'SALDO_PRIME' : 'Sin informar'),
      state: this.receiptState(row.status, row.payment?.status, row.debt?.amountPending),
      pending: (row.debt?.amountPending ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
export type LegacyAdministrativeDetailViews = {
  customer: Awaited<ReturnType<LegacyAdministrativeDetails['customer']>>;
  membership: Awaited<ReturnType<LegacyAdministrativeDetails['membership']>>;
  transaction: Awaited<ReturnType<LegacyAdministrativeDetails['transaction']>>;
  receipt: Awaited<ReturnType<LegacyAdministrativeDetails['receipt']>>;
};
