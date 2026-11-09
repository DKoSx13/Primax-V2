import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { compare } from 'bcryptjs';
import { Request } from 'express';
import { acceptsNewAttention } from '../operations/terminal-availability';
import { EMPTY_ATTENTION_IDLE_MS, isEmptyAttention } from '../operations/empty-attention';
import { PrismaService } from '../prisma/prisma.service';
import { KioskStore } from './redis-store';
import { kioskRoute } from './policy';
import { Actor } from '../auth/access';

export type KioskSession = {
  authenticated: boolean;
  csrf: string;
  version: string;
  expiresAt: number;
  stationId: string;
  recoveryOperationId?: string;
  recoveryTerminalId?: string;
};
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const opaque = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class KioskService {
  constructor(
    private readonly config: ConfigService,
    private readonly store: KioskStore,
    private readonly db: PrismaService,
  ) {}
  private version() {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('KIOSK_GATEWAY_SECRET'),
    )
      .update(
        JSON.stringify([
          this.config.get('KIOSK_OPERATOR_USER'),
          this.config.get('KIOSK_OPERATOR_PASSWORD_HASH'),
          this.config.get('KIOSK_STATION_ID'),
          this.config.get('KIOSK_SESSION_VERSION', '1'),
        ]),
      )
      .digest('hex');
  }
  verifyGateway(req: Request) {
    if (!['academic', 'local'].includes(this.config.get<string>('APP_MODE') || ''))
      throw new ForbiddenException();
    const timestamp = req.header('x-kiosk-time') || '';
    const signature = req.header('x-kiosk-signature') || '';
    if (
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 30000 ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw new UnauthorizedException();
    const message = JSON.stringify([
      req.method,
      req.originalUrl,
      timestamp,
      req.body ?? null,
      req.header('x-kiosk-session') || '',
      req.header('x-csrf-token') || '',
      req.header('x-terminal-session') || '',
      req.header('authorization') || '',
      req.header('x-terminal-owner') || '',
    ]);
    const expected = createHmac(
      'sha256',
      this.config.getOrThrow<string>('KIOSK_GATEWAY_SECRET'),
    )
      .update(message)
      .digest('hex');
    if (!equal(expected, signature)) throw new UnauthorizedException();
  }
  async limitTechnical(req: Request) {
    const identity =
      req.header('x-terminal-session') || req.header('authorization') || '';
    if (!(await this.store.limit(`technical:${digest(identity)}`, 240, 60)))
      throw new HttpException('Demasiadas operaciones', 429);
  }
  private sessionKey(token: string) {
    if (!opaque.test(token))
      throw new UnauthorizedException('Sesión de terminal requerida');
    return this.store.key(`session:${digest(token)}`);
  }
  async session(token: string, csrf?: string, authenticated = true) {
    const raw = await this.store.command<string | null>(
      'GET',
      this.sessionKey(token),
    );
    if (!raw) throw new UnauthorizedException('Sesión de terminal vencida');
    let value: KioskSession;
    try {
      value = JSON.parse(raw) as KioskSession;
    } catch {
      throw new UnauthorizedException();
    }
    if (
      value.expiresAt <= Date.now() ||
      value.version !== this.version() ||
      value.stationId !== this.config.get('KIOSK_STATION_ID') ||
      (authenticated && !value.authenticated)
    )
      throw new UnauthorizedException('Sesión de terminal vencida');
    if (csrf !== undefined && !equal(value.csrf, csrf))
      throw new ForbiddenException('Verificación CSRF fallida');
    return value;
  }
  private async create(authenticated: boolean, recovery?: { operationId: string; terminalId: string }) {
    const token = randomBytes(32).toString('base64url');
    const ttl = authenticated ? 1800 : 300;
    const session: KioskSession = {
      authenticated,
      csrf: randomBytes(32).toString('base64url'),
      version: this.version(),
      expiresAt: Date.now() + ttl * 1000,
      stationId: this.config.getOrThrow<string>('KIOSK_STATION_ID'),
      ...(recovery ? { recoveryOperationId: recovery.operationId, recoveryTerminalId: recovery.terminalId } : {}),
    };
    if (
      (await this.store.command(
        'SET',
        this.sessionKey(token),
        JSON.stringify(session),
        'EX',
        ttl,
        'NX',
      )) !== 'OK'
    )
      throw new UnauthorizedException();
    return { token, ...this.publicSession(session), ttl };
  }
  private publicSession(value: KioskSession) {
    return {
      authenticated: value.authenticated,
      csrfToken: value.csrf,
      expiresAt: value.expiresAt,
      stationId: value.authenticated ? value.stationId : undefined,
      ...(value.recoveryOperationId ? { recoveryOperationId: value.recoveryOperationId } : {}),
    };
  }
  async status(req: Request) {
    this.verifyGateway(req);
    const token = req.header('x-kiosk-session') || '';
    if (token) {
      try {
        return {
          ...this.publicSession(await this.session(token, undefined, false)),
        };
      } catch (error) {
        if (!(error instanceof UnauthorizedException)) throw error;
      }
    }
    if (!(await this.store.limit('preauth', 120, 60)))
      throw new HttpException('Demasiadas solicitudes', 429);
    return this.create(false);
  }
  async login(req: Request, body: { username: string; password: string }) {
    this.verifyGateway(req);
    const token = req.header('x-kiosk-session') || '';
    await this.session(token, req.header('x-csrf-token') || '', false);
    // One configured account: changing usernames/IPs cannot evade this shared cap.
    if (!(await this.store.limit('operator-login', 5, 900)))
      throw new HttpException(
        'Demasiados intentos. Espera quince minutos.',
        429,
      );
    const validPassword = await compare(
      body.password,
      this.config.getOrThrow<string>('KIOSK_OPERATOR_PASSWORD_HASH'),
    );
    if (
      !equal(
        body.username,
        this.config.getOrThrow<string>('KIOSK_OPERATOR_USER'),
      ) ||
      !validPassword
    )
      throw new UnauthorizedException('Credenciales incorrectas');
    const station = await this.db.station.findUnique({
      where: { id: this.config.getOrThrow<string>('KIOSK_STATION_ID') },
    });
    if (!station?.active)
      throw new ForbiddenException('Estación de terminal no disponible');
    // Claim the pre-session once: concurrent logins cannot rotate it twice.
    if ((await this.store.command<number>('DEL', this.sessionKey(token))) !== 1)
      throw new UnauthorizedException();
    return this.create(true);
  }
  async bootstrapTerminal(req: Request, requestedTerminalId?: string, requestedTerminalCode?: string) {
    this.verifyGateway(req);
    await this.limitTechnical(req);
    const stationId = this.config.getOrThrow<string>('KIOSK_STATION_ID');
    const terminals = await this.db.terminal.findMany({
      where: { stationId, lifecycle: 'REGISTRADA', ...(requestedTerminalId ? { id: requestedTerminalId } : {}), ...(requestedTerminalCode ? { code: requestedTerminalCode } : {}) },
      select: { id: true, operationalStatus: true },
      take: 2,
    });
    if (terminals.length !== 1)
      throw new ConflictException('Configura una terminal única para este kiosco');
    const previous = req.header('x-terminal-session') || '';
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
    const session = await this.create(true);
    return { ...session, terminalId, terminalToken: credential.terminalToken, terminalExpiresAt: credential.expiresAt };
  }

  private async recoveryEvidence(tx: PrismaService, operation: { id: string; operationId: string; stationId: string; terminalId: string; pumpId: string }) {
    const operationId = operation.operationId;
    const [orders, payments, authorizations, reservations, sales] = await Promise.all([
      tx.onlineOrder.findMany({ where: { operationId }, select: { id: true, status: true, paymentId: true, transactionId: true, userId: true, method: true, amount: true, providerId: true } }),
      tx.payment.findMany({ where: { operationId }, select: { id: true, status: true, transactionId: true, method: true, amount: true, refundedAmount: true, provider: true } }),
      tx.fuelAuthorization.findMany({ where: { operationId }, select: { id: true, status: true, paymentId: true, stationId: true, terminalId: true, pumpId: true, terminalOperationId: true, dispensedAmount: true } }),
      tx.inventoryReservation.findMany({ where: { operationId }, select: { id: true, status: true, authorizationId: true, transactionId: true, stationId: true, terminalOperationId: true } }),
      tx.transaction.findMany({ where: { operationId }, select: { id: true, status: true, authorizationId: true, stationId: true, terminalId: true, pumpId: true, terminalOperationId: true } }),
    ]);
    if (orders.length > 1 || payments.length > 1 || authorizations.length > 1 || reservations.length > 1 || sales.length > 1)
      throw new ConflictException('Vínculos financieros ambiguos');
    const order = orders[0], payment = payments[0], auth = authorizations[0], reservation = reservations[0], sale = sales[0];
    const consistent = order && payment && reservation && !order.userId && !order.transactionId &&
      order.method === payment.method && order.amount.eq(payment.amount) && payment.refundedAmount.isZero() &&
      payment.provider === 'DEMO' && order.providerId === `demo:${order.id}` &&
      reservation.stationId === operation.stationId && reservation.terminalOperationId === operation.id &&
      (!auth || (auth.stationId === operation.stationId && auth.terminalId === operation.terminalId &&
        auth.pumpId === operation.pumpId && auth.terminalOperationId === operation.id)) &&
      (!sale || (sale.stationId === operation.stationId && sale.terminalId === operation.terminalId &&
        sale.pumpId === operation.pumpId && sale.terminalOperationId === operation.id));
    if (!consistent) throw new ConflictException('Vínculos financieros incompatibles');
    const events = await tx.paymentEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' }, select: { eventKey: true, detail: true, kind: true } });
    const providerEvent = events.find(event => event.eventKey === `demo-terminal:${order.id}`) ||
      events.find(event => event.eventKey === `demo-confirm:${order.id}`) ||
      events.find(event => event.eventKey === `demo-intent:${order.id}`);
    let providerState: string | undefined;
    try {
      const remote = JSON.parse(providerEvent?.detail ?? '') as { id?: string; order_number?: string; amount?: number; currency_code?: string; state?: string };
      if (remote.id === order.providerId && remote.order_number === order.id && remote.amount === order.amount.mul(100).toNumber() && remote.currency_code === 'PEN')
        providerState = remote.state;
    } catch { /* invalid provider evidence is rejected below */ }
    const receipt = sale ? await tx.receipt.findUnique({ where: { transactionId: sale.id }, select: { id: true, number: true } }) : null;
    const pending = providerState === 'pending' && order?.status === 'PENDING' && payment?.status === 'PENDING' &&
      order.paymentId === payment.id && !auth && !sale && reservation?.status === 'PENDING_PAYMENT' &&
      !reservation.authorizationId && !reservation.transactionId && !payment.transactionId;
    const settled = providerState === 'paid' && order?.status === 'CAPTURED' && payment?.status === 'CAPTURED' &&
      order.paymentId === payment.id && payment.transactionId === sale?.id &&
      auth?.status === 'SETTLED' && auth.paymentId === payment.id &&
      reservation?.status === 'CLOSED' && reservation.authorizationId === auth.id &&
      reservation.transactionId === sale?.id && sale?.status === 'PAID' && sale.authorizationId === auth.id &&
      auth.dispensedAmount.gt(0) && receipt;
    if (!pending && !settled) throw new ConflictException('Estado financiero no apto para recuperación');
    return {
      kind: pending ? 'PENDING_PAYMENT' : 'SETTLED_SALE',
      orderId: order.id, orderStatus: order.status, paymentId: payment.id,
      paymentStatus: payment.status, authorizationId: auth?.id ?? null,
      authorizationStatus: auth?.status ?? null, reservationId: reservation.id,
      reservationStatus: reservation.status, transactionId: sale?.id ?? null,
      transactionStatus: sale?.status ?? null,
      receiptId: receipt?.id ?? null, receiptNumber: receipt?.number ?? null,
      providerEventKey: providerEvent?.eventKey ?? null, providerState,
    };
  }

  async issueRecoveryTicket(actor: Extract<Actor, { kind: 'control' }>, operationId: string, reason: string) {
    if (reason.trim().length < 10) throw new BadRequestException('Justificación insuficiente');
    if (!actor.global || actor.role !== 'SUPER_ADMIN' ||
      !actor.permissions.includes('ADMIN_TERMINAL_MANAGE') ||
      !actor.permissions.includes('ADMIN_INCIDENT_MANAGE'))
      throw new ForbiddenException('Recuperación excepcional reservada a SUPER_ADMIN');
    const ticket = randomBytes(32).toString('base64url');
    const result = await this.db.atomic(async tx => {
      const candidate = await tx.terminalOperation.findUnique({ where: { operationId } });
      if (!candidate) throw new NotFoundException('Operación no encontrada');
      await tx.$queryRaw`SELECT "id" FROM "Terminal" WHERE "id"=${candidate.terminalId}::uuid FOR UPDATE`;
      const operation = await tx.terminalOperation.findUniqueOrThrow({ where: { operationId }, include: { terminal: true } });
      const systemGrant = await tx.userPermissionGrant.findFirst({ where: { userId: actor.userId, permission: 'SYSTEM_ADMIN', revokedAt: null } });
      const adminUser = await tx.user.findUnique({ where: { id: actor.userId }, select: { active: true } });
      if (!systemGrant || !adminUser?.active) throw new ForbiddenException('Autorización administrativa vencida');
      if (operation.id !== candidate.id || operation.terminalId !== candidate.terminalId || operation.status !== 'ACTIVE' || operation.closedAt ||
          operation.terminal.lifecycle !== 'REGISTRADA' || operation.terminal.stationId !== operation.stationId)
        throw new ConflictException('Operación o terminal cambió de estado');
      const credential = await tx.terminalCredential.findFirst({ where: { terminalId: operation.terminalId, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (credential) throw new ConflictException('La terminal aún tiene una credencial vigente');
      const evidence = await this.recoveryEvidence(tx as PrismaService, operation);
      const key = this.store.key(`recovery-ticket:${digest(ticket)}`);
      const pendingKey = this.store.key(`recovery-pending:${operation.terminalId}`);
      const claim = await this.store.command<string>('SET', pendingKey, digest(ticket), 'EX', 300, 'NX');
      if (claim !== 'OK') throw new ConflictException('Ya existe una recuperación pendiente');
      await this.store.command('SET', key, JSON.stringify({ operationId, operationRowId: operation.id, terminalId: operation.terminalId, stationId: operation.stationId, actorUserId: actor.userId, evidence }), 'EX', 300);
      await tx.operationalAuditEvent.create({ data: {
        eventKey: `terminal-recovery-request:${digest(ticket)}`, actorKind: 'USER', actorUserId: actor.userId,
        stationId: operation.stationId, terminalId: operation.terminalId, targetId: operation.id,
        action: 'TERMINAL_RECOVERY_REQUESTED', outcome: 'SUCCESS',
        details: { operationId, reason, evidence },
      } });
      return { terminalId: operation.terminalId, terminalCode: operation.terminal.code, evidence };
    });
    return { ticket, expiresInSeconds: 300, operationId, ...result };
  }

  async auditRecoveryDenied(actor: Extract<Actor, { kind: 'control' }>, operationId: string, reason: string, error: unknown) {
    const operation = await this.db.terminalOperation.findUnique({ where: { operationId } });
    await this.db.operationalAuditEvent.create({ data: {
      eventKey: `terminal-recovery-denied:${randomBytes(16).toString('hex')}`,
      actorKind: 'USER', actorUserId: actor.userId,
      stationId: operation?.stationId ?? null, terminalId: operation?.terminalId ?? null,
      targetId: operation?.id ?? null, action: 'TERMINAL_RECOVERY_REQUESTED', outcome: 'ERROR',
      details: { operationId, reason, message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
    } });
  }

  async exchangeRecoveryTicket(req: Request, ticket: string, terminalCode: string) {
    this.verifyGateway(req);
    await this.limitTechnical(req);
    const owner = req.header('x-terminal-owner') || '';
    if (!uuid.test(owner) || !opaque.test(ticket)) throw new BadRequestException('Datos de recuperación inválidos');
    const key = this.store.key(`recovery-ticket:${digest(ticket)}`);
    const raw = await this.store.command<string | null>('GET', key);
    if (!raw) throw new UnauthorizedException('Recuperación vencida o utilizada');
    const grant = JSON.parse(raw) as { operationId: string; operationRowId: string; terminalId: string; stationId: string; actorUserId: string; evidence: unknown };
    const result = await this.db.atomic(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Terminal" WHERE "id"=${grant.terminalId}::uuid FOR UPDATE`;
      const terminal = await tx.terminal.findUniqueOrThrow({ where: { id: grant.terminalId } });
      const operation = await tx.terminalOperation.findUniqueOrThrow({ where: { operationId: grant.operationId } });
      const systemGrant = await tx.userPermissionGrant.findFirst({ where: { userId: grant.actorUserId, permission: 'SYSTEM_ADMIN', revokedAt: null } });
      const adminUser = await tx.user.findUnique({ where: { id: grant.actorUserId }, select: { active: true } });
      if (!systemGrant || !adminUser?.active) throw new ForbiddenException('Autorización administrativa revocada');
      if (terminal.code !== terminalCode || terminal.stationId !== grant.stationId ||
          terminal.stationId !== this.config.getOrThrow<string>('KIOSK_STATION_ID') ||
          terminal.lifecycle !== 'REGISTRADA' || operation.id !== grant.operationRowId ||
          operation.terminalId !== terminal.id || operation.status !== 'ACTIVE' || operation.closedAt)
        throw new ConflictException('Terminal u operación incompatible');
      const evidence = await this.recoveryEvidence(tx as PrismaService, operation);
      if (JSON.stringify(evidence) !== JSON.stringify(grant.evidence))
        throw new ConflictException('El estado financiero cambió durante la recuperación');
      const pendingKey = this.store.key(`recovery-pending:${terminal.id}`);
      if (await this.store.command<string | null>('GET', pendingKey) !== digest(ticket))
        throw new UnauthorizedException('Recuperación reemplazada');
      if (await this.store.command<string | null>('GETDEL', key) !== raw)
        throw new UnauthorizedException('Recuperación ya utilizada');
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      await tx.terminalCredential.updateMany({ where: { terminalId: terminal.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.store.command('DEL', this.store.key(`terminal-owner:${terminal.id}`));
      await this.store.command('SET', this.store.key(`terminal-owner:${terminal.id}`), digest(owner), 'EX', 900);
      await this.store.command('SET', this.store.key(`recovery-credential:${digest(token)}`), JSON.stringify({ terminalId: terminal.id, stationId: terminal.stationId, operationId: grant.operationId, owner: digest(owner), expiresAt: expiresAt.getTime() }), 'EX', 900);
      await this.store.command('SET', this.store.key(`recovery-current:${terminal.id}`), digest(token), 'EX', 900);
      await this.store.command('DEL', pendingKey);
      await tx.operationalAuditEvent.create({ data: {
        eventKey: `terminal-recovery-granted:${digest(ticket)}`, actorKind: 'USER', actorUserId: grant.actorUserId,
        stationId: terminal.stationId, terminalId: terminal.id, targetId: operation.id,
        action: 'TERMINAL_RECOVERY_GRANTED', outcome: 'SUCCESS',
        details: { operationId: grant.operationId, evidence },
      } });
      return { token, expiresAt, operationId: grant.operationId, terminalId: terminal.id, evidence };
    }).catch(async error => {
      await this.db.operationalAuditEvent.create({ data: {
        eventKey: `terminal-recovery-exchange-denied:${randomBytes(16).toString('hex')}`,
        actorKind: 'USER', actorUserId: grant.actorUserId, stationId: grant.stationId,
        terminalId: grant.terminalId, targetId: grant.operationRowId,
        action: 'TERMINAL_RECOVERY_GRANTED', outcome: 'ERROR',
        details: { operationId: grant.operationId, message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      } }).catch(() => undefined);
      throw error;
    });
    const session = await this.create(true, { operationId: result.operationId, terminalId: result.terminalId });
    return { ...session, terminalToken: result.token, terminalExpiresAt: result.expiresAt, operationId: result.operationId, evidence: result.evidence };
  }

  async recoveryCredential(token: string, owner: string) {
    if (!/^[a-f0-9]{64}$/.test(token) || !uuid.test(owner)) throw new UnauthorizedException('Credencial de recuperación requerida');
    const raw = await this.store.command<string | null>('GET', this.store.key(`recovery-credential:${digest(token)}`));
    if (!raw) throw new UnauthorizedException('Credencial de recuperación vencida');
    const scope = JSON.parse(raw) as { terminalId: string; stationId: string; operationId: string; owner: string; expiresAt: number };
    if (scope.expiresAt <= Date.now() || scope.owner !== digest(owner) ||
        await this.store.command<string | null>('GET', this.store.key(`recovery-current:${scope.terminalId}`)) !== digest(token) ||
        await this.store.command<string | null>('GET', this.store.key(`terminal-owner:${scope.terminalId}`)) !== scope.owner)
      throw new UnauthorizedException('Control de terminal inválido');
    return scope;
  }

  async claimTerminal(req: Request, terminalId: string, operationId?: string) {
    const owner = req.header('x-terminal-owner') || '';
    if (!uuid.test(owner)) throw new BadRequestException('Identidad de pestaña requerida');
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Terminal" WHERE "id"=${terminalId}::uuid FOR UPDATE`;
      const active = await tx.terminalOperation.findFirst({ where: { terminalId, closedAt: null } });
      const key = this.store.key(`terminal-owner:${terminalId}`);
      const hash = digest(owner);
      const current = await this.store.command<string | null>('GET', key);
      if (current && current !== hash) {
        const recoveryHash = await this.store.command<string | null>('GET', this.store.key(`recovery-current:${terminalId}`));
        const raw = recoveryHash && !active
          ? await this.store.command<string | null>('GET', this.store.key(`recovery-credential:${recoveryHash}`)) : null;
        let closedRecovery = false;
        if (raw) {
          const scope = JSON.parse(raw) as { terminalId: string; operationId: string; owner: string };
          const prior = scope.terminalId === terminalId && scope.owner === current
            ? await tx.terminalOperation.findUnique({ where: { operationId: scope.operationId }, select: { closedAt: true } }) : null;
          closedRecovery = Boolean(prior?.closedAt);
        }
        if (!closedRecovery)
          throw new ConflictException('Terminal ocupada en otra pestaña. Conserva la sesión original.');
        await this.store.command('SET', key, hash, 'EX', 120);
        await this.store.command('DEL', this.store.key(`recovery-current:${terminalId}`));
      }
      if (active && !current && (operationId !== active.operationId || !(await isEmptyAttention(tx, active))))
        throw new ConflictException('Operación activa; recupera la pestaña original o solicita asistencia.');
      if (!current) await this.store.command('SET', key, hash, 'EX', 120);
      else await this.store.command('EXPIRE', key, 120);
      return { claimed: true, activeOperationId: active?.operationId ?? null };
    });
  }

  async assertTerminalOwner(terminalId: string, owner: string, strict = false) {
    const key = this.store.key(`terminal-owner:${terminalId}`);
    const current = await this.store.command<string | null>('GET', key);
    if (!current && !strict) return; // Existing in-flight sessions before this feature remain recoverable.
    if (!uuid.test(owner) || current !== digest(owner))
      throw new ConflictException('Terminal ocupada en otra pestaña. Conserva la sesión original.');
    await this.store.command('EXPIRE', key, 120);
  }
  async touchTerminalOwner(terminalId: string, owner: string) {
    if (!uuid.test(owner)) return;
    const key = this.store.key(`terminal-owner:${terminalId}`);
    if (await this.store.command<string | null>('GET', key) === digest(owner))
      await this.store.command('EXPIRE', key, 120);
  }

  async releaseClosedRecovery(terminalId: string, operationId: string, owner: string) {
    if (!uuid.test(owner)) return;
    const operation = await this.db.terminalOperation.findUnique({ where: { operationId }, select: { terminalId: true, closedAt: true } });
    if (!operation?.closedAt || operation.terminalId !== terminalId) return;
    const key = this.store.key(`terminal-owner:${terminalId}`);
    if (await this.store.command<string | null>('GET', key) === digest(owner))
      await this.store.command('DEL', key);
  }

  async logout(req: Request) {
    this.verifyGateway(req);
    const token = req.header('x-kiosk-session') || '';
    await this.session(token, req.header('x-csrf-token') || '', false);
    await this.store.command('DEL', this.sessionKey(token));
    return { authenticated: false };
  }
  private assertStation(stationId: unknown, expected: string) {
    if (stationId !== expected)
      throw new ForbiddenException('Operación fuera de la estación autorizada');
  }
  private async binding(
    operationId: unknown,
    stationId: string,
    create: boolean,
    purpose = 'operation',
  ) {
    if (typeof operationId !== 'string' || !uuid.test(operationId))
      throw new BadRequestException('operationId inválido');
    const key = this.store.key(`${purpose}:${operationId.toLowerCase()}`);
    if (create)
      await this.store.command('SET', key, stationId, 'EX', 604800, 'NX');
    this.assertStation(
      await this.store.command<string | null>('GET', key),
      stationId,
    );
  }
  private async authorization(id: string, stationId: string) {
    const row = await this.db.fuelAuthorization.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    this.assertStation(row.stationId, stationId);
  }
  async authorize(
    req: Request,
    target?: { method: string; path: string; body?: Record<string, unknown> },
  ) {
    this.verifyGateway(req);
    const session = await this.session(
      req.header('x-kiosk-session') || '',
      req.header('x-csrf-token') || '',
    );
    if (
      !(await this.store.limit(
        `operations:${digest(req.header('x-kiosk-session') || '')}`,
        240,
        60,
      ))
    )
      throw new HttpException('Demasiadas operaciones', 429);
    const method = target?.method ?? req.method;
    const path = target?.path ?? req.originalUrl;
    const body = target?.body ?? req.body ?? {};
    if (!kioskRoute(method, path))
      throw new ForbiddenException('Operación de terminal no permitida');
    const stationId = session.stationId;
    const technical = req.header('x-terminal-session') || '';
    if (session.recoveryOperationId) {
      const scope = await this.recoveryCredential(technical, req.header('x-terminal-owner') || '');
      if (scope.operationId !== session.recoveryOperationId || scope.terminalId !== session.recoveryTerminalId || scope.stationId !== stationId)
        throw new ForbiddenException('Recuperación fuera de alcance');
      const order = await this.db.onlineOrder.findUnique({ where: { operationId: scope.operationId } });
      if (!order || order.userId || order.transactionId ||
          !(method === 'POST' && path === `/api/v1/online-orders/${order.id}/cancel` && order.status === 'PENDING'))
        throw new ForbiddenException('Recuperación limitada a la orden existente');
    }
    if (!session.recoveryOperationId && method === 'POST' && technical && /^[a-f0-9]{64}$/.test(technical) &&
        (/^\/api\/v1\/(authorizations|transactions|online-orders)(?:\/|$)/.test(path))) {
      const credential = await this.db.terminalCredential.findUnique({ where: { tokenHash: digest(technical) } });
      if (!credential || credential.revokedAt || credential.expiresAt <= new Date()) throw new UnauthorizedException('Credencial técnica vencida');
      await this.assertTerminalOwner(credential.terminalId, req.header('x-terminal-owner') || '');
    }
    if (method === 'POST' && path === '/api/v1/admin/check-plate') {
      await this.binding(body.operationId, stationId, true, 'plate-check');
    }
    if (
      method === 'POST' &&
      ['/api/v1/authorizations', '/api/v1/transactions'].includes(path)
    ) {
      this.assertStation(body.stationId, stationId);
      if (typeof body.operationId !== 'string' || !uuid.test(body.operationId))
        throw new BadRequestException('operationId inválido');
      const prior = path.endsWith('/transactions')
        ? await this.db.transaction.findUnique({
            where: { operationId: body.operationId as string },
          })
        : await this.db.fuelAuthorization.findUnique({
            where: { operationId: body.operationId as string },
          });
      if (prior) this.assertStation(prior.stationId, stationId);
      // An operation UUID must not attach a pending payment from another station.
      // Check existing order bindings before creating any new trusted association.
      const order = await this.db.onlineOrder.findUnique({
        where: { operationId: body.operationId },
      });
      if (order) {
        if (order.userId || order.transactionId) throw new ForbiddenException();
        await this.binding(body.operationId, stationId, false);
      }
      const payment = await this.db.payment.findUnique({
        where: { operationId: body.operationId },
        include: { authorization: true, transaction: true },
      });
      if (payment) {
        const paymentStation =
          payment.authorization?.stationId ?? payment.transaction?.stationId;
        if (paymentStation) this.assertStation(paymentStation, stationId);
        else if (!order)
          throw new ForbiddenException('Pago sin estación verificable');
      }
      await this.binding(body.operationId, stationId, true);
      if (body.authorizationId) {
        if (
          typeof body.authorizationId !== 'string' ||
          !uuid.test(body.authorizationId)
        )
          throw new BadRequestException();
        await this.authorization(body.authorizationId, stationId);
      }
    }
    if (method === 'POST' && path === '/api/v1/online-orders') {
      const auth = body.authorization as Record<string, unknown> | undefined;
      if (!auth || body.transactionId || auth.operationId !== body.operationId)
        throw new ForbiddenException();
      this.assertStation(auth.stationId, stationId);
      if (typeof body.operationId !== 'string' || !uuid.test(body.operationId))
        throw new BadRequestException();
      const priorOrder = await this.db.onlineOrder.findUnique({
        where: { operationId: body.operationId },
      });
      if (priorOrder?.userId || priorOrder?.transactionId)
        throw new ForbiddenException();
      await this.binding(body.operationId, stationId, !priorOrder);
    }
    const parts = path.split('/');
    const resource = parts[3],
      id = parts[4];
    if (id && uuid.test(id)) {
      if (resource === 'authorizations')
        await this.authorization(id, stationId);
      if (resource === 'transactions') {
        const row = await this.db.transaction.findUnique({ where: { id } });
        if (!row) throw new NotFoundException();
        this.assertStation(row.stationId, stationId);
      }
      if (resource === 'online-orders') {
        const order = await this.db.onlineOrder.findUnique({ where: { id } });
        if (!order || order.userId || order.transactionId)
          throw new ForbiddenException();
        if (session.recoveryOperationId) {
          if (order.operationId !== session.recoveryOperationId) throw new ForbiddenException();
        } else await this.binding(order.operationId, stationId, false);
      }
      if (resource === 'payments') {
        const row = await this.db.payment.findUnique({
          where: { id },
          include: { authorization: true, transaction: true },
        });
        this.assertStation(
          row?.authorization?.stationId ?? row?.transaction?.stationId,
          stationId,
        );
      }
    }
    return { kind: 'kiosk' as const, stationId };
  }
}
