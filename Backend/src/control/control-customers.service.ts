import { Injectable, BadRequestException } from '@nestjs/common';
import { AdminControlPermission, PurchaseMode } from '@prisma/client';
import { Actor } from '../auth/access';
import { PrismaService } from '../prisma/prisma.service';
import { LegacyCustomerReadContext } from '../../services/administration/src/adapters/outbound/legacy-customer-context';
import { AdministrativeListsAdapter } from '../../services/administration/src/adapters/inbound/administrative-lists.adapter';
import { AdministrativeDetailsAdapter } from '../../services/administration/src/adapters/inbound/administrative-details.adapter';

type ControlActor = Extract<Actor, { kind: 'control' }>;
type Filter = { stationId?: string; q?: string; from?: Date; to?: Date; status?: string; mode?: PurchaseMode; method?: string };

@Injectable()
export class ControlCustomersService extends LegacyCustomerReadContext {
  constructor(db: PrismaService, private readonly lists: AdministrativeListsAdapter, private readonly details: AdministrativeDetailsAdapter) { super(db); }
  private range(from?: Date, to?: Date) {
    if (from && to && from > to) throw new BadRequestException('El rango de fechas no es válido');
    return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  }
  private operationSearch(q?: string) {
    const value = q?.trim();
    if (!value) return {};
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ? { operationId: value }
      : { plate: { contains: value, mode: 'insensitive' as const } };
  }

  async customers(actor: ControlActor, filters: Filter) { return this.lists.customers(actor, filters); }

  async customer(actor: ControlActor, userId: string) { return this.details.customer(actor, userId); }

  async memberships(actor: ControlActor, filters: Filter) { return this.lists.memberships(actor, filters); }

  async membership(actor: ControlActor, membershipId: string) { return this.details.membership(actor, membershipId); }

  async vehicles(actor: ControlActor, filters: Filter) { return this.lists.vehicles(actor, filters); }

  async transactions(actor: ControlActor, filters: Filter) {
    const ids = await this.scope(actor, filters.stationId, AdminControlPermission.ADMIN_TRANSACTION_VIEW);
    const createdAt = this.range(filters.from, filters.to);
    const q = filters.q?.trim();
    const stationFilter = ids ? { stationId: { in: ids } } : {};
    const [transactions, authorizations] = await Promise.all([
      this.db.transaction.findMany({
        where: { ...stationFilter, ...(createdAt ? { createdAt } : {}), ...(filters.mode ? { mode: filters.mode } : {}), ...this.operationSearch(q) },
        include: { receipt: true, terminalOperation: { select: { number: true, status: true } }, station: { select: { id: true, code: true, name: true } }, fuel: { select: { id: true, code: true, name: true } }, vehicle: { select: { id: true, plate: true, label: true } }, membership: { select: { id: true, number: true, status: true, user: { select: { id: true, name: true } } } }, payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } }, authorization: { select: { id: true, status: true, mode: true, dispensedAmount: true, dispensedGallons: true } }, terminal: { select: { code: true } }, pump: { select: { code: true } }, operationalIncidents: { select: { code: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 150,
      }),
      this.db.fuelAuthorization.findMany({
        where: { ...stationFilter, transaction: null, ...(createdAt ? { createdAt } : {}), ...(filters.mode ? { mode: filters.mode } : {}), ...this.operationSearch(q) },
        include: { terminalOperation: { select: { number: true, status: true } }, station: { select: { id: true, code: true, name: true } }, fuel: { select: { id: true, code: true, name: true } }, vehicle: { select: { id: true, plate: true, label: true } }, membership: { select: { number: true, user: { select: { id: true, name: true } } } }, payment: { select: { id: true, status: true, method: true, amount: true, refundedAmount: true } }, terminal: { select: { code: true } }, pump: { select: { code: true } }, operationalIncidents: { select: { code: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 150,
      }),
    ]);
    const rows = [...transactions.map((row) => this.transactionProjection(row, actor)), ...authorizations.map((row) => this.authorizationProjection(row, actor))].filter((row) => (!filters.status || row.financialStatus === filters.status || row.physicalStatus === filters.status || row.reviewStatus === filters.status) && (!filters.method || row.method === filters.method)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 100);
    return rows;
  }

  async transaction(actor: ControlActor, transactionId: string) { return this.details.transaction(actor, transactionId); }

  async receipt(actor: ControlActor, transactionId: string) { return this.details.receipt(actor, transactionId); }

}
