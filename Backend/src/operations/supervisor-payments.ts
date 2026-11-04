import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  SetMetadata,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Actor, CurrentActor } from '../auth/access';
import { PrismaService } from '../prisma/prisma.service';
import { OnlineOrdersService } from '../payments/online-orders';
import { recordPaymentIssue } from '../payments/payment-incidents';
import { OperationsService } from './operations.service';
type ControlActor = Extract<Actor, { kind: 'control' }>;
class RecoveryActionDto {
  @IsIn(['RETRY', 'RESELECT', 'CANCEL', 'ESCALATE']) action:
    | 'RETRY'
    | 'RESELECT'
    | 'CANCEL'
    | 'ESCALATE';
  @IsOptional() @IsString() @MaxLength(500) observation?: string;
}
@Injectable()
export class SupervisorPaymentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly orders: OnlineOrdersService,
    private readonly operations: OperationsService,
  ) {}
  private async operation(actor: ControlActor, operationId: string) {
    const operation = await this.db.terminalOperation.findUnique({
      where: { operationId },
    });
    if (!operation) throw new NotFoundException('Operación no encontrada');
    if (
      !(await this.db.supervisorStationAssignment.findFirst({
        where: {
          userId: actor.userId,
          stationId: operation.stationId,
          endedAt: null,
          user: { active: true },
          station: { active: true },
        },
      }))
    )
      throw new ForbiddenException('Supervisor fuera de esta estación');
    return operation;
  }
  async detail(actor: ControlActor, operationId: string) {
    const operation = await this.operation(actor, operationId);
    const [payment, authorization, order, incidents] = await Promise.all([
      this.db.payment.findUnique({
        where: { operationId },
        select: {
          id: true,
          method: true,
          status: true,
          provider: true,
          amount: true,
          refundedAmount: true,
        },
      }),
      this.db.fuelAuthorization.findUnique({
        where: { operationId },
        select: {
          id: true,
          status: true,
          dispensedAmount: true,
          dispensedGallons: true,
        },
      }),
      this.db.onlineOrder.findUnique({
        where: { operationId },
        select: {
          id: true,
          status: true,
          method: true,
          updatedAt: true,
          providerId: true,
        },
      }),
      this.db.operationalIncident.findMany({
        where: { operationId, stationId: operation.stationId },
      }),
    ]);
    const canReselect =
      order?.status === 'PENDING' &&
      order.providerId?.startsWith('demo:') &&
      payment?.status === 'PENDING' &&
      !authorization;
    return {
      operationId,
      stationId: operation.stationId,
      terminalId: operation.terminalId,
      pumpId: operation.pumpId,
      payment,
      authorization,
      order: order
        ? {
            id: order.id,
            status: order.status,
            method: order.method,
            updatedAt: order.updatedAt,
          }
        : null,
      incidents,
      allowedActions: [
        'ESCALATE',
        ...(order && ['PENDING', 'CREATING'].includes(order.status)
          ? ['RETRY']
          : []),
        ...(canReselect ? ['RESELECT', 'CANCEL'] : []),
        ...(!authorization &&
        (!order || ['FAILED', 'CANCELLED'].includes(order.status))
          ? ['CANCEL']
          : []),
      ],
    };
  }
  async act(actor: ControlActor, operationId: string, dto: RecoveryActionDto) {
    const detail = await this.detail(actor, operationId);
    if (!detail.allowedActions.includes(dto.action))
      throw new ConflictException(
        'Acción no segura para el estado financiero actual. Concilia o escala.',
      );
    const kiosk = { kind: 'kiosk' as const, stationId: detail.stationId };
    if (dto.action === 'RETRY' && detail.order)
      await this.orders.status(detail.order.id, kiosk);
    if (dto.action === 'CANCEL') {
      if (detail.order?.status === 'PENDING')
        await this.orders.cancel(detail.order.id, kiosk);
      await this.operations.cancelUnpaidOperation(actor.userId, operationId);
    }
    await this.db.atomic(async (tx) => {
      if (dto.action === 'ESCALATE')
        await recordPaymentIssue(
          tx,
          operationId,
          dto.observation?.trim() || 'Supervisor solicita revisión del pago',
          actor.userId,
        );
      await tx.operationalAuditEvent.create({
        data: {
          eventKey: `supervisor-payment:${randomUUID()}`,
          actorKind: 'USER',
          actorUserId: actor.userId,
          stationId: detail.stationId,
          terminalId: detail.terminalId,
          action: `SUPERVISOR_PAYMENT_${dto.action}`,
          targetId: operationId,
          outcome: 'SUCCESS',
          details: { operationId, observation: dto.observation ?? null },
        },
      });
    });
    return {
      ...(await this.detail(actor, operationId)),
      message:
        dto.action === 'RESELECT'
          ? 'Cliente puede seleccionar otro método permitido en FuelFlow; Backend volverá a validar el pago.'
          : 'Acción registrada. El estado financiero procede de Backend/proveedor.',
    };
  }
}
@SetMetadata('access', 'control')
@Controller('control/supervisor/payments')
export class SupervisorPaymentsController {
  constructor(private readonly service: SupervisorPaymentsService) {}
  @Get(':id') detail(
    @CurrentActor() actor: ControlActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @Post(':id/actions') act(
    @CurrentActor() actor: ControlActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecoveryActionDto,
  ) {
    return this.service.act(actor, id, dto);
  }
}
