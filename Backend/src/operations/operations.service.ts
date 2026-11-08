import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

import { acceptsNewAttention } from './terminal-availability';
import { isEmptyAttention } from './empty-attention';

type Db = Prisma.TransactionClient;

@Injectable()
export class OperationsService {
  constructor(private readonly db: PrismaService) {}

  private async operationalAtomic<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    try {
      return await this.db.atomic(work, { retryUnique: false });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' ||
          (error.code === 'P2010' && error.meta?.code === '23505'))
      )
        throw new ConflictException(
          'Ya existe una asignación u operación activa',
        );
      throw error;
    }
  }

  private audit(
    tx: Db,
    action: string,
    actorUserId: string | null,
    stationId: string | null,
    terminalId: string | null,
    targetId: string | null,
    shiftId: string | null = null,
    actorKind?: 'USER' | 'TERMINAL' | 'SYSTEM',
    details?: Prisma.InputJsonValue,
  ) {
    return tx.operationalAuditEvent.create({
      data: {
        eventKey: randomUUID(),
        actorKind: actorKind ?? (actorUserId ? 'USER' : 'SYSTEM'),
        actorUserId,
        stationId,
        terminalId,
        shiftId,
        action,
        targetId,
        outcome: 'SUCCESS',
        details,
      },
    });
  }

  private async assigned(tx: Db, userId: string, stationId: string) {
    const system = await tx.userPermissionGrant.findFirst({
      where: { userId, permission: 'SYSTEM_ADMIN', revokedAt: null },
    });
    if (system) return;
    const account = await tx.adminControlAccount.findUnique({
      where: { userId },
      include: { stations: { where: { endedAt: null, stationId, station: { active: true } } } },
    });
    const grant = await tx.adminControlGrant.findFirst({
      where: { userId, permission: 'ADMIN_INCIDENT_MANAGE', revokedAt: null },
    });
    if (account?.status !== 'APPROVED' || !account.emailVerifiedAt || !grant || !account.stations.length)
      throw new ForbiddenException('Permiso o estación fuera del alcance autorizado');
  }

  async cancelUnpaidOperation(userId: string, operationId: string) {
    const operation = await this.db.terminalOperation.findUnique({where:{operationId}});
    if (!operation) throw new NotFoundException('Operación no encontrada');
    await this.assigned(this.db, userId, operation.stationId);
    if (await this.db.fuelAuthorization.findFirst({where:{operationId}}) ||
        await this.db.transaction.findFirst({where:{operationId}}) ||
        await this.db.inventoryReservation.findFirst({where:{operationId,status:{in:['PENDING_PAYMENT','ACTIVE','REVIEW']}}}) ||
        await this.db.onlineOrder.findFirst({where:{operationId,status:{in:['CREATING','PENDING','CAPTURED','REFUNDING']}}}))
      throw new ConflictException('Hay una venta o pago activo; requiere conciliación');
    return this.closeOperation(operation.terminalId, operationId, userId);
  }

  async terminalMe(terminalId: string, credentialId?: string) {
    if (credentialId) await this.db.terminalCredential.updateMany({
      where: { id: credentialId, terminalId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { lastUsedAt: new Date() },
    });
    const terminal = await this.db.terminal.findUnique({
      where: { id: terminalId },
      include: {
        assignments: { where: { endedAt: null }, include: { pump: true } },
        operations: { where: { closedAt: null } },
      },
    });
    if (!terminal || terminal.lifecycle !== 'REGISTRADA')
      throw new UnauthorizedException('Terminal revocada');
    const active = terminal.operations[0];
    return {
      id: terminal.id,
      stationId: terminal.stationId,
      code: terminal.code,
      lifecycle: terminal.lifecycle,
      operationalStatus: terminal.operationalStatus,
      activeOperationId: active?.operationId ?? null,
      emptyAttention: active ? await isEmptyAttention(this.db, active) : false,
      pump: terminal.assignments[0]?.pump ?? null,
      prepared: (acceptsNewAttention(terminal.operationalStatus) || terminal.operationalStatus === 'EN_USO') || terminal.operations.length > 0,
      canStart:
        acceptsNewAttention(terminal.operationalStatus) &&
        terminal.operations.length === 0 &&
        terminal.assignments.some((assignment) => assignment.pump.active),
    };
  }

  async startOperation(terminalId: string, operationId: string) {
    return this.operationalAtomic(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Terminal" WHERE "id"=${terminalId}::uuid FOR UPDATE`;
      const existing = await tx.terminalOperation.findUnique({
        where: { operationId },
      });
      if (existing) {
        if (existing.terminalId !== terminalId)
          throw new NotFoundException('Operación no encontrada');
        return existing;
      }
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (
        !terminal ||
        terminal.lifecycle !== 'REGISTRADA' ||
        !acceptsNewAttention(terminal.operationalStatus)
      )
        throw new ConflictException('Terminal no disponible');
      const active = await tx.terminalOperation.findFirst({
        where: { terminalId, closedAt: null },
      });
      if (active) throw new ConflictException('Terminal con operación activa');
      const assignment = await tx.terminalPumpAssignment.findFirst({
        where: { terminalId, stationId: terminal.stationId, endedAt: null, pump: { active: true } },
        include: { pump: true },
      });
      if (
        !assignment ||
        assignment.endedAt ||
        !assignment.pump.active ||
        assignment.stationId !== terminal.stationId ||
        assignment.terminalId !== terminalId ||
        assignment.pump.stationId !== terminal.stationId
      )
        throw new ConflictException('Asignación de surtidor inválida');
      const operation = await tx.terminalOperation.create({
        data: {
          operationId,
          stationId: terminal.stationId,
          pumpId: assignment.pumpId,
          terminalId,
          terminalPumpAssignmentId: assignment.id,
        },
      });
      await tx.terminal.update({
        where: { id: terminalId },
        data: { operationalStatus: 'EN_USO', statusVersion: { increment: 1 } },
      });
      await this.audit(
        tx,
        'OPERATION_OPENED',
        null,
        terminal.stationId,
        terminalId,
        operation.id,
        null,
        'TERMINAL',
      );
      return operation;
    });
  }

  async operation(terminalId: string, operationId: string) {
    const operation = await this.db.terminalOperation.findUnique({
      where: { operationId },
    });
    if (!operation || operation.terminalId !== terminalId)
      throw new NotFoundException('Operación no encontrada');
    return operation;
  }

  async closeOperation(terminalId: string, operationId: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const operation = await tx.terminalOperation.findUnique({
        where: { operationId },
      });
      if (!operation || operation.terminalId !== terminalId)
        throw new NotFoundException('Operación no encontrada');
      if (operation.closedAt) return operation;
      await tx.$queryRaw`SELECT "id" FROM "Terminal" WHERE "id"=${terminalId}::uuid FOR UPDATE`;
      const terminal = await tx.terminal.findUniqueOrThrow({
        where: { id: terminalId },
      });
      if (terminal.lifecycle === 'REVOCADA')
        throw new UnauthorizedException(
          'Terminal revocada; solicita asistencia al personal',
        );
      const [authorizations, transactions, inventoryReservations] = await Promise.all([
        tx.fuelAuthorization.findMany({
          where: {
            OR: [{ terminalOperationId: operation.id }, { operationId }],
          },
        }),
        tx.transaction.findMany({
          where: {
            OR: [{ terminalOperationId: operation.id }, { operationId }],
          },
        }),
        tx.inventoryReservation.findMany({
          where: { operationId },
          select: { status: true },
        }),
      ]);
      const transaction = transactions[0];
      if (transactions.length > 1 || authorizations.length > 1)
        throw new ConflictException(
          'Vínculos financieros ambiguos; requiere conciliación',
        );
      const authorization = authorizations[0];
      if (!authorization && (
        await tx.payment.findFirst({ where: { operationId, status: { notIn: ['CANCELLED', 'REJECTED'] } }, select: { id: true } }) ||
        await tx.onlineOrder.findFirst({ where: { operationId, status: { notIn: ['FAILED', 'CANCELLED'] } }, select: { id: true } })
      )) throw new ConflictException('Pago u orden sin autorización conciliada; requiere intervención autorizada');
      if (
        inventoryReservations.some((reservation) =>
          ['PENDING_PAYMENT', 'ACTIVE', 'REVIEW'].includes(reservation.status),
        )
      )
        throw new ConflictException(
          'Autorización pendiente: reserva de inventario requiere cierre o conciliación',
        );
      if (
        authorization &&
        (authorization.operationId !== operationId ||
          authorization.stationId !== operation.stationId ||
          (authorization.terminalOperationId &&
            authorization.terminalOperationId !== operation.id) ||
          (authorization.terminalId &&
            authorization.terminalId !== operation.terminalId) ||
          (authorization.pumpId && authorization.pumpId !== operation.pumpId) ||
          (authorization.terminalPumpAssignmentId &&
            authorization.terminalPumpAssignmentId !==
              operation.terminalPumpAssignmentId))
      )
        throw new ConflictException(
          'Autorización no coincide con la operación; requiere conciliación',
        );
      if (
        transaction &&
        (transaction.operationId !== operationId ||
          transaction.stationId !== operation.stationId ||
          (authorization && transaction.authorizationId !== authorization.id) ||
          (transaction.terminalOperationId &&
            transaction.terminalOperationId !== operation.id) ||
          (transaction.terminalId &&
            transaction.terminalId !== operation.terminalId) ||
          (transaction.pumpId && transaction.pumpId !== operation.pumpId) ||
          (transaction.terminalPumpAssignmentId &&
            transaction.terminalPumpAssignmentId !==
              operation.terminalPumpAssignmentId))
      )
        throw new ConflictException(
          'Transacción no coincide con la operación; requiere conciliación',
        );
      if (
        authorization &&
        ['RESERVED', 'DISPENSING', 'INTERVENTION_REQUIRED'].includes(
          authorization.status,
        )
      )
        throw new ConflictException(
          'Autorización pendiente de liquidación o conciliación',
        );
      if (authorization?.status === 'SETTLED' && !transaction)
        throw new ConflictException(
          'Autorización liquidada sin transacción; requiere conciliación',
        );
      if (!authorization && transaction)
        throw new ConflictException(
          'Transacción sin autorización asociada; requiere conciliación',
        );
      if (authorization?.status === 'RELEASED' && transaction)
        throw new ConflictException(
          'Autorización liberada con transacción; requiere conciliación',
        );
      const updated = await tx.terminalOperation.update({
        where: { id: operation.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.terminal.update({
        where: { id: terminalId },
        data: {
          operationalStatus: terminal.operationalStatus === 'EN_USO' ? 'DISPONIBLE' :
            terminal.operationalStatus === 'BLOQUEADA' ? 'DISPONIBLE' : terminal.operationalStatus,
          statusVersion: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        'OPERATION_CLOSED',
        actorUserId ?? null,
        operation.stationId,
        terminalId,
        operation.id,
        null,
        actorUserId ? 'USER' : 'TERMINAL',
      );
      return updated;
    });
  }

  async resolveOperation(userId: string, operationId: string, reason: string) {
    return this.operationalAtomic(async (tx) => {
      const operation = await tx.terminalOperation.findUnique({
        where: { operationId },
        include: { terminal: true },
      });
      if (!operation) throw new NotFoundException('Operación no encontrada');
      await this.assigned(tx, userId, operation.stationId);
      if (operation.closedAt) return operation;
      if (
        operation.status !== 'INTERVENTION_REQUIRED' &&
        !['ASISTENCIA', 'FUERA_DE_SERVICIO'].includes(
          operation.terminal.operationalStatus,
        )
      )
        throw new ConflictException('Operación sin intervención requerida');
      const activeAuth = await tx.fuelAuthorization.findFirst({
        where: {
          OR: [{ terminalOperationId: operation.id }, { operationId }],
          status: { in: ['RESERVED', 'DISPENSING', 'INTERVENTION_REQUIRED'] },
        },
      });
      if (activeAuth)
        throw new ConflictException('Autorización pendiente de conciliación');
      const activeInventory = await tx.inventoryReservation.findFirst({
        where: {
          operationId,
          status: { in: ['PENDING_PAYMENT', 'ACTIVE', 'REVIEW'] },
        },
      });
      if (activeInventory)
        throw new ConflictException(
          'Autorización pendiente: reserva de inventario requiere conciliación',
        );
      const now = new Date();
      const result = await tx.terminalOperation.update({
        where: { id: operation.id },
        data: { status: 'CLOSED', closedAt: now, version: { increment: 1 } },
      });
      await tx.terminal.update({
        where: { id: operation.terminalId },
        data: {
          operationalStatus:
            operation.terminal.lifecycle === 'REVOCADA'
              ? 'FUERA_DE_SERVICIO'
              : 'DISPONIBLE',
          statusVersion: { increment: 1 },
        },
      });
      if (operation.terminal.lifecycle === 'REVOCADA')
        await tx.terminalPumpAssignment.updateMany({
          where: { terminalId: operation.terminalId, endedAt: null },
          data: {
            endedAt: now,
            endReason: 'Terminal revocada; intervención completada',
          },
        });
      await this.audit(
        tx,
        'OPERATION_RESOLVED',
        userId,
        operation.stationId,
        operation.terminalId,
        operation.id,
        null,
        'USER',
        { reason },
      );
      return result;
    });
  }

  async grantAdmin(userId: string, reason: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.active) throw new NotFoundException('Usuario no encontrado');
      const grant = await tx.userPermissionGrant.create({
        data: {
          userId,
          permission: 'SYSTEM_ADMIN',
          reason,
          grantedByUserId: actorUserId,
        },
      });
      await this.audit(
        tx,
        'ADMIN_GRANTED',
        actorUserId ?? null,
        null,
        null,
        grant.id,
      );
      return grant;
    });
  }

  async revokeAdminGrant(id: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const grant = await tx.userPermissionGrant.findUnique({ where: { id } });
      if (!grant || grant.revokedAt)
        throw new NotFoundException('Permiso no vigente');
      const result = await tx.userPermissionGrant.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await this.audit(
        tx,
        'ADMIN_REVOKED',
        actorUserId ?? null,
        null,
        null,
        id,
      );
      return result;
    });
  }

  async createPump(
    stationId: string,
    code: string,
    name: string,
    actorUserId?: string,
  ) {
    return this.operationalAtomic(async (tx) => {
      const station = await tx.station.findUnique({ where: { id: stationId } });
      if (!station?.active)
        throw new NotFoundException('Estación no disponible');
      const pump = await tx.pump.create({ data: { stationId, code, name } });
      await this.audit(
        tx,
        'PUMP_CREATED',
        actorUserId ?? null,
        stationId,
        null,
        pump.id,
      );
      return pump;
    });
  }

  async createTerminal(stationId: string, code: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const station = await tx.station.findUnique({ where: { id: stationId } });
      if (!station?.active)
        throw new NotFoundException('Estación no disponible');
      const terminal = await tx.terminal.create({ data: { stationId, code } });
      await this.audit(
        tx,
        'TERMINAL_CREATED',
        actorUserId ?? null,
        stationId,
        terminal.id,
        terminal.id,
      );
      return terminal;
    });
  }

  async assignTerminal(
    terminalId: string,
    pumpId: string,
    actorUserId?: string,
  ) {
    return this.operationalAtomic(async (tx) => {
      const [terminal, pump] = await Promise.all([
        tx.terminal.findUnique({ where: { id: terminalId } }),
        tx.pump.findUnique({ where: { id: pumpId } }),
      ]);
      if (!terminal || !pump || terminal.stationId !== pump.stationId)
        throw new BadRequestException(
          'Terminal y surtidor pertenecen a estaciones distintas',
        );
      if (terminal.lifecycle !== 'REGISTRADA' || !pump.active)
        throw new ConflictException('Terminal o surtidor inactivo');
      const assignment = await tx.terminalPumpAssignment.create({
        data: {
          stationId: terminal.stationId,
          terminalId,
          pumpId,
          assignedByUserId: actorUserId,
        },
      });
      await this.audit(
        tx,
        'TERMINAL_PUMP_ASSIGNED',
        actorUserId ?? null,
        terminal.stationId,
        terminalId,
        assignment.id,
      );
      return assignment;
    });
  }

  async endTerminalAssignment(id: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const assignment = await tx.terminalPumpAssignment.findUnique({
        where: { id },
      });
      if (!assignment || assignment.endedAt)
        throw new NotFoundException('Asignación no vigente');
      if (
        await tx.terminalOperation.findFirst({
          where: { terminalPumpAssignmentId: id, closedAt: null },
        })
      )
        throw new ConflictException('Operación pendiente en esta asignación');
      const terminal = await tx.terminal.findUniqueOrThrow({ where: { id: assignment.terminalId } });
      if (['DISPONIBLE', 'EN_USO'].includes(terminal.operationalStatus))
        throw new ConflictException('Suspende la terminal antes de reasignarla');
      const result = await tx.terminalPumpAssignment.update({
        where: { id },
        data: { endedAt: new Date(), endReason: 'Reasignación administrativa' },
      });
      await this.audit(
        tx,
        'TERMINAL_PUMP_UNASSIGNED',
        actorUserId ?? null,
        assignment.stationId,
        assignment.terminalId,
        id,
      );
      return result;
    });
  }

  async revokeTerminal(terminalId: string, actorUserId?: string) {
    return this.operationalAtomic(async (tx) => {
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (!terminal) throw new NotFoundException('Terminal no encontrada');
      if (terminal.lifecycle === 'REVOCADA') return terminal;
      const now = new Date();
      await tx.terminalCredential.updateMany({
        where: { terminalId, revokedAt: null },
        data: { revokedAt: now },
      });
      const active = await tx.terminalOperation.findFirst({
        where: { terminalId, closedAt: null },
      });
      if (active)
        await tx.terminalOperation.update({
          where: { id: active.id },
          data: { status: 'INTERVENTION_REQUIRED', version: { increment: 1 } },
        });
      if (!active)
        await tx.terminalPumpAssignment.updateMany({
          where: { terminalId, endedAt: null },
          data: { endedAt: now, endReason: 'Terminal revocada' },
        });
      const result = await tx.terminal.update({
        where: { id: terminalId },
        data: {
          lifecycle: 'REVOCADA',
          revokedAt: now,
          operationalStatus: active ? 'FUERA_DE_SERVICIO' : 'BLOQUEADA',
          statusVersion: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        'TERMINAL_REVOKED',
        actorUserId ?? null,
        terminal.stationId,
        terminalId,
        terminalId,
      );
      return result;
    });
  }
}
