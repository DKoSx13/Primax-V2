import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssistanceRequest, AssistanceStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Actor } from '../auth/access';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssistanceActionDto,
  CreateAssistanceDto,
} from './assistance.controller';

type ControlActor = Extract<Actor, { kind: 'control' }>;
type TerminalActor = Extract<Actor, { kind: 'terminal' }>;
const active: AssistanceStatus[] = ['PENDIENTE', 'EN_ATENCION'];
const include = {
  terminal: { select: { code: true } },
  pump: { select: { code: true } },
  assignedSupervisor: { select: { id: true, name: true } },
} satisfies Prisma.AssistanceRequestInclude;

@Injectable()
export class AssistanceService {
  constructor(private readonly db: PrismaService) {}

  private async audit(
    tx: Prisma.TransactionClient,
    row: AssistanceRequest,
    action: string,
    actor: ControlActor | TerminalActor,
    details: Prisma.InputJsonObject = {},
  ) {
    await tx.operationalAuditEvent.create({
      data: {
        eventKey: `assistance:${row.id}:${randomUUID()}`,
        action: `ASSISTANCE_${action}`,
        actorKind: actor.kind === 'terminal' ? 'TERMINAL' : 'USER',
        actorUserId: actor.kind === 'control' ? actor.userId : null,
        stationId: row.stationId,
        terminalId: row.terminalId,
        targetId: row.id,
        outcome: 'SUCCESS',
        details: {
          operationId: row.operationId,
          pumpId: row.pumpId,
          status: row.status,
          ...details,
        },
      },
    });
  }

  async create(actor: TerminalActor, dto: CreateAssistanceDto) {
    return this.db.atomic(async (tx) => {
      const existing = await tx.assistanceRequest.findUnique({
        where: { requestId: dto.requestId },
      });
      if (existing) {
        if (
          existing.terminalId !== actor.terminalId ||
          existing.reason !== dto.reason ||
          existing.operationId !== (dto.operationId ?? null) ||
          existing.observation !== (dto.observation ?? null)
        )
          throw new ConflictException(
            'La solicitud ya existe con otro contexto',
          );
        return this.safe(existing);
      }
      const assignment = await tx.terminalPumpAssignment.findFirst({
        where: {
          terminalId: actor.terminalId,
          stationId: actor.stationId,
          endedAt: null,
          pump: { active: true },
          terminal: { lifecycle: 'REGISTRADA' },
          station: { active: true },
        },
      });
      if (!assignment)
        throw new ConflictException(
          'La terminal no tiene un surtidor autorizado. Contacta al personal.',
        );
      const operation = dto.operationId
        ? await tx.terminalOperation.findUnique({
            where: { operationId: dto.operationId },
          })
        : null;
      if (
        dto.operationId &&
        (!operation ||
          operation.terminalId !== actor.terminalId ||
          operation.stationId !== actor.stationId ||
          operation.pumpId !== assignment.pumpId)
      )
        throw new ForbiddenException('Operación fuera de esta terminal');
      const authorization = dto.operationId
        ? await tx.fuelAuthorization.findUnique({
            where: { operationId: dto.operationId },
            select: { plate: true },
          })
        : null;
      const row = await tx.assistanceRequest.create({
        data: {
          requestId: dto.requestId,
          stationId: actor.stationId,
          terminalId: actor.terminalId,
          pumpId: assignment.pumpId,
          operationId: operation?.operationId,
          terminalOperationId: operation?.id,
          reason: dto.reason,
          observation: dto.observation,
          plate: authorization?.plate ?? dto.plate,
        },
      });
      await this.audit(tx, row, 'CREATED', actor, {
        reason: row.reason,
        observation: row.observation,
      });
      return this.safe(row);
    });
  }

  private safe(row: AssistanceRequest) {
    return {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      acceptedAt: row.acceptedAt,
      resolvedAt: row.resolvedAt,
      escalatedAt: row.escalatedAt,
      cancelledAt: row.cancelledAt,
    };
  }
  async terminalStatus(actor: TerminalActor, id: string) {
    const row = await this.db.assistanceRequest.findFirst({
      where: { id, terminalId: actor.terminalId, stationId: actor.stationId },
    });
    if (!row) throw new NotFoundException('Solicitud no encontrada');
    return this.safe(row);
  }
  async cancel(actor: TerminalActor, id: string) {
    return this.db.atomic(async (tx) => {
      const row = await tx.assistanceRequest.findFirst({
        where: { id, terminalId: actor.terminalId, stationId: actor.stationId },
      });
      if (!row) throw new NotFoundException('Solicitud no encontrada');
      if (row.status === 'CANCELADA_POR_CLIENTE') return this.safe(row);
      const changed = await tx.assistanceRequest.updateMany({
        where: { id, status: { in: active } },
        data: { status: 'CANCELADA_POR_CLIENTE', cancelledAt: new Date() },
      });
      if (!changed.count)
        throw new ConflictException('La solicitud ya finalizó');
      const updated = await tx.assistanceRequest.findUniqueOrThrow({
        where: { id },
      });
      await this.audit(tx, updated, 'CANCELLED', actor);
      return this.safe(updated);
    });
  }

  private async supervisorStations(
    actor: ControlActor,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const assignments = await tx.supervisorStationAssignment.findMany({
      where: {
        userId: actor.userId,
        endedAt: null,
        user: { active: true },
        station: { active: true },
      },
      select: { stationId: true },
    });
    return assignments.map((x) => x.stationId);
  }
  private async readScope(actor: ControlActor, stationId?: string) {
    const supervisor = await this.supervisorStations(actor);
    const admin = actor.permissions.includes('ADMIN_INCIDENT_VIEW');
    const global = admin && actor.global;
    const ids = [
      ...new Set([...supervisor, ...(admin ? actor.stationIds : [])]),
    ];
    if (stationId && !global && !ids.includes(stationId))
      throw new ForbiddenException('Estación fuera del alcance autorizado');
    return stationId ? { stationId } : global ? {} : { stationId: { in: ids } };
  }
  async list(
    actor: ControlActor,
    query: { stationId?: string; status?: AssistanceStatus },
  ) {
    const scope = await this.readScope(actor, query.stationId);
    return this.db.assistanceRequest.findMany({
      where: { ...scope, ...(query.status ? { status: query.status } : {}) },
      include,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
  }
  async detail(actor: ControlActor, id: string) {
    const scope = await this.readScope(actor);
    const row = await this.db.assistanceRequest.findFirst({
      where: { id, ...scope },
      include,
    });
    if (!row)
      throw new NotFoundException('Solicitud no encontrada en tu alcance');
    const [events, incidents, authorization, transaction] = await Promise.all([
      this.db.operationalAuditEvent.findMany({
        where: { targetId: id, stationId: row.stationId },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.operationalIncident.findMany({
        where: {
          eventKey: `assistance:${id}:escalated`,
          stationId: row.stationId,
        },
      }),
      row.operationId
        ? this.db.fuelAuthorization.findUnique({
            where: { operationId: row.operationId },
            select: {
              status: true,
              membership: { select: { user: { select: { name: true } } } },
            },
          })
        : null,
      row.operationId
        ? this.db.transaction.findUnique({
            where: { operationId: row.operationId },
            select: {
              membership: { select: { user: { select: { name: true } } } },
            },
          })
        : null,
    ]);
    return {
      ...row,
      customerName:
        authorization?.membership?.user.name ??
        transaction?.membership?.user.name ??
        null,
      events,
      incidents,
    };
  }
  async act(actor: ControlActor, id: string, dto: AssistanceActionDto) {
    return this.db.atomic(async (tx) => {
      const stations = await this.supervisorStations(actor, tx);
      const row = await tx.assistanceRequest.findFirst({
        where: { id, stationId: { in: stations } },
      });
      if (!row)
        throw new ForbiddenException(
          'Se requiere asignación de Supervisor a esta estación',
        );
      const accepting = dto.action === 'ACCEPT';
      if (
        !accepting &&
        (row.status !== 'EN_ATENCION' ||
          row.assignedSupervisorId !== actor.userId)
      )
        throw new ConflictException(
          'Solo el Supervisor responsable puede atender una solicitud en atención',
        );
      if (['RESOLVE', 'ESCALATE'].includes(dto.action) && !dto.result?.trim())
        throw new BadRequestException('Registra el resultado de la atención');
      if (dto.action === 'NOTE' && !dto.observation?.trim())
        throw new BadRequestException('Registra una observación');
      const now = new Date();
      const status: AssistanceStatus = (
        {
          ACCEPT: 'EN_ATENCION',
          NOTE: 'EN_ATENCION',
          RESOLVE: 'RESUELTA',
          ESCALATE: 'ESCALADA',
          CANCEL: 'CANCELADA_POR_CLIENTE',
        } as const
      )[dto.action];
      const changed = await tx.assistanceRequest.updateMany({
        where: {
          id,
          status: accepting ? 'PENDIENTE' : 'EN_ATENCION',
          ...(accepting
            ? { assignedSupervisorId: null }
            : { assignedSupervisorId: actor.userId }),
        },
        data: {
          status,
          ...(accepting
            ? { assignedSupervisorId: actor.userId, acceptedAt: now }
            : {}),
          ...(dto.observation !== undefined
            ? { observation: dto.observation }
            : {}),
          ...(dto.result !== undefined ? { result: dto.result } : {}),
          ...(dto.action === 'RESOLVE' ? { resolvedAt: now } : {}),
          ...(dto.action === 'ESCALATE' ? { escalatedAt: now } : {}),
          ...(dto.action === 'CANCEL' ? { cancelledAt: now } : {}),
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'La solicitud ya está siendo atendida o finalizó',
        );
      const updated = await tx.assistanceRequest.findUniqueOrThrow({
        where: { id },
        include,
      });
      if (dto.action === 'ESCALATE')
        await tx.operationalIncident.create({
          data: {
            eventKey: `assistance:${id}:escalated`,
            code: 'OPERATION_REVIEW',
            stationId: row.stationId,
            terminalId: row.terminalId,
            pumpId: row.pumpId,
            operationId: row.operationId,
            terminalOperationId: row.terminalOperationId,
            summary: dto.result!.slice(0, 300),
            context: {
              assistanceRequestId: id,
              assignedSupervisorId: actor.userId,
              observation: dto.observation ?? row.observation,
              result: dto.result!,
            },
          },
        });
      await this.audit(tx, updated, dto.action, actor, {
        observation: dto.observation ?? null,
        result: dto.result ?? null,
      });
      return updated;
    });
  }
}
