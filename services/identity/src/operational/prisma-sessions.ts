// Materialized PostgreSQL unit. Refresh only via prepare-operational-adapter.cjs.
import { Injectable, ConflictException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../persistence/compatibility-db';
import { acceptsNewAttention } from '../compatibility/operations/terminal-availability';
import { isEmptyAttention, EMPTY_ATTENTION_IDLE_MS } from '../compatibility/operations/empty-attention';
import { OperationalSessionPort, OperationalSessionCommand } from './port';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const LEGACY_BOOTSTRAP_UNIT_SHA256 = 'b8467b4a89d96c388b03fe2c5ce31665b63fa8158713ad39698ee101f436e34d';
@Injectable()
export class PrismaOperationalSessions implements OperationalSessionPort {
  constructor(private readonly db: PrismaService) {}
  async issueOrResume(command: OperationalSessionCommand) {
    if (command.contractVersion !== 1) throw new Error('Unsupported operational contract');
    const stationId = command.stationId;
    const requestedTerminalId = command.terminalId;
    const requestedTerminalCode = command.terminalCode;
    const terminals = await this.db.terminal.findMany({
      where: { stationId, lifecycle: 'REGISTRADA', ...(requestedTerminalId ? { id: requestedTerminalId } : {}), ...(requestedTerminalCode ? { code: requestedTerminalCode } : {}) },
      select: { id: true, operationalStatus: true },
      take: 2,
    });
    if (terminals.length !== 1)
      throw new ConflictException('Configura una terminal única para este kiosco');
    const previous = command.previousCredential || '';
    const terminalId = terminals[0].id;
    const credential = await this.db.atomic(async tx => {
        // Serialize recovery, credential replacement and new attention on this terminal.
        await tx.$queryRaw`SELECT "id" FROM "Terminal" WHERE "id"=${terminalId}::uuid FOR UPDATE`;
        const terminal = await tx.terminal.findUniqueOrThrow({ where: { id: terminalId } });
        const now = new Date();
        if (terminal.lifecycle !== 'REGISTRADA') throw new ConflictException('Terminal revocada');
        const existing = /^[a-f0-9]{64}$/.test(previous)
          ? await tx.terminalCredential.findUnique({ where: { tokenHash: digest(previous) } }) : null;
        const ownsSession = existing?.terminalId === terminal.id && !existing.revokedAt && existing.expiresAt > now;
        let active = await tx.terminalOperation.findFirst({ where: { terminalId, closedAt: null } });
        const operational = acceptsNewAttention(terminal.operationalStatus) || terminal.operationalStatus === 'EN_USO';
        if (!operational && !(ownsSession && active))
          throw new ConflictException('Terminal temporalmente no disponible: requiere asistencia por su estado operativo.');
        if (active && operational) {
          const empty = await isEmptyAttention(tx, active);
          const activity = await tx.terminalCredential.aggregate({ where: { terminalId }, _max: { lastUsedAt: true } });
          const lastActivity = Math.max(active.openedAt.getTime(), activity._max.lastUsedAt?.getTime() || 0);
          if (empty && now.getTime() - lastActivity >= EMPTY_ATTENTION_IDLE_MS) {
            await tx.terminalOperation.update({ where: { id: active.id }, data: {
              status: 'CLOSED', closedAt: now, version: { increment: 1 },
            } });
            await tx.operationalAuditEvent.create({ data: {
              eventKey: `abandoned-empty-attention:${active.id}`, actorKind: 'SYSTEM',
              stationId, terminalId, targetId: active.id, action: 'ABANDONED_EMPTY_ATTENTION_CLOSED', outcome: 'SUCCESS',
              details: { operationId: active.operationId, lastActivity: new Date(lastActivity).toISOString(), reason: 'Idle lease expired; no financial, inventory or incident evidence' },
            } });
            active = null;
          } else if (!ownsSession) {
            throw new ConflictException(empty
              ? 'Hay una atención reciente en otro navegador. Se recuperará automáticamente si queda abandonada; utiliza la sesión original para continuar.'
              : 'Operación con pago, autorización, inventario o incidencia pendiente. Recupera la sesión original o solicita intervención autorizada.');
          }
        }
        if (!active && ['EN_USO', 'BLOQUEADA'].includes(terminal.operationalStatus)) {
          await tx.terminal.update({ where: { id: terminalId }, data: { operationalStatus: 'DISPONIBLE', statusVersion: { increment: 1 } } });
        }
        if (ownsSession) {
          await tx.terminalCredential.update({ where: { id: existing.id }, data: { lastUsedAt: now } });
          return { terminalToken: previous, expiresAt: existing.expiresAt };
        }
        const terminalToken = randomBytes(32).toString('hex');
        const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const priorCredential = await tx.terminalCredential.findFirst({ where: { terminalId, revokedAt: null }, select: { id: true } });
         await tx.terminalCredential.updateMany({ where: { terminalId: terminal.id, revokedAt: null }, data: { revokedAt: new Date() } });
        const issued = await tx.terminalCredential.create({ data: { terminalId, tokenHash: digest(terminalToken), expiresAt, lastUsedAt: now, rotatedFromId: priorCredential?.id } });
        await tx.operationalAuditEvent.create({ data: {
          eventKey: `terminal-credential:${issued.id}`, actorKind: 'TERMINAL',
          stationId, terminalId: terminal.id, action: 'TERMINAL_CREDENTIAL_ISSUED',
          targetId: issued.id, outcome: 'SUCCESS',
        } });
        return { terminalToken, expiresAt };
      });
    return { terminalId, terminalToken: credential.terminalToken, expiresAt: credential.expiresAt };
  }
}
