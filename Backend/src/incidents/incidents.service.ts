import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  OperationalIncident,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient;

@Injectable()
export class IncidentsService {
  constructor(private readonly db: PrismaService) {}

  /** Creates the single stable INC-001 for a confirmed prepaid operation halted at zero progress. */
  async recordConfirmedPaymentWithoutDispense(
    tx: Db,
    authorization: {
      id: string;
      operationId: string;
      stationId: string;
      terminalOperationId: string | null;
      terminalId: string | null;
      pumpId: string | null;
      paymentId: string | null;
      mode: string;
      status: string;
      dispensedAmount: Prisma.Decimal;
    },
  ) {
    if (
      authorization.mode !== 'PREPAGO' ||
      authorization.status !== 'INTERVENTION_REQUIRED' ||
      !authorization.dispensedAmount.isZero() ||
      !authorization.paymentId
    )
      return null;

    const existing = await tx.operationalIncident.findUnique({
      where: {
        code_operationId: {
          code: 'INC_001',
          operationId: authorization.operationId,
        },
      },
    });
    if (existing) return existing;

    const payment = await tx.payment.findUnique({
      where: { id: authorization.paymentId },
    });
    if (
      !payment ||
      payment.operationId !== authorization.operationId ||
      payment.status !== 'CAPTURED' ||
      payment.amount.lte(0) ||
      !payment.refundedAmount.isZero()
    )
      return null;
    const transaction = await tx.transaction.findUnique({
      where: { operationId: authorization.operationId },
    });
    if (transaction) return null;

    const operation = authorization.terminalOperationId
      ? await tx.terminalOperation.findUnique({
          where: { id: authorization.terminalOperationId },
        })
      : null;
    if (
      operation &&
      (operation.operationId !== authorization.operationId ||
        operation.stationId !== authorization.stationId ||
        (authorization.terminalId && operation.terminalId !== authorization.terminalId) ||
        (authorization.pumpId && operation.pumpId !== authorization.pumpId))
    )
      throw new ConflictException('Vínculos de operación incompatibles');

    const incident = await tx.operationalIncident.create({
      data: {
        eventKey: `INC-001:${authorization.operationId}`,
        code: 'INC_001',
        severity: 'HIGH',
        stationId: authorization.stationId,
        terminalId: operation?.terminalId ?? authorization.terminalId,
        pumpId: operation?.pumpId ?? authorization.pumpId,
        operationId: authorization.operationId,
        terminalOperationId: operation?.id,
        authorizationId: authorization.id,
        paymentId: payment.id,
        summary:
          'Pago confirmado con despacho detenido antes de registrar combustible.',
        context: {
          paymentStatus: payment.status,
          paymentMethod: payment.method,
          authorizationStatus: authorization.status,
          dispensedAmount: authorization.dispensedAmount.toFixed(2),
          refundedAmount: payment.refundedAmount.toFixed(2),
        },
      },
    });
    await tx.operationalAuditEvent.create({
      data: {
        eventKey: `incident:${incident.id}:opened`,
        actorKind: 'SYSTEM',
        stationId: incident.stationId,
        terminalId: incident.terminalId,
        action: 'INCIDENT_OPENED',
        targetId: incident.id,
        outcome: 'SUCCESS',
        details: { code: incident.code, operationId: incident.operationId },
      },
    });
    return incident;
  }

}
