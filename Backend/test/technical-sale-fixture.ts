import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Request } from 'express';
import { OperationsService } from '../src/operations/operations.service';

/** Test-only gateway boundary. AccessGuard still checks persisted terminal binding. */
export function technicalSaleFixture(db: PrismaClient) {
  let stationId = '';
  let operations: OperationsService;
  const prepared = new Map<string, Promise<string>>();

  const gateway = {
    authorize: async (req: Request) => {
      const operationId = (req.body as { operationId?: unknown })?.operationId;
      if (typeof operationId === 'string' && /^[0-9a-f-]{36}$/i.test(operationId)) {
        let token = prepared.get(operationId);
        if (!token) {
          token = (async () => {
            const pump = await operations.createPump(stationId, `T${randomUUID().slice(0, 8)}`, 'E2E pump');
            const terminal = await operations.createTerminal(stationId, `T${randomUUID().slice(0, 8)}`);
            await operations.assignTerminal(terminal.id, pump.id);
            await db.terminal.update({ where: { id: terminal.id }, data: { operationalStatus: 'DISPONIBLE' } });
            const token = randomBytes(32).toString('hex');
            await db.terminalCredential.create({ data: { terminalId: terminal.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
            await operations.startOperation(terminal.id, operationId);
            return token;
          })();
          prepared.set(operationId, token);
        }
        req.headers['x-terminal-session'] = await token;
      }
      return { kind: 'kiosk', stationId };
    },
    limitTechnical: async () => undefined,
  };

  return {
    gateway,
    start: async (app: INestApplication, id: string) => {
      stationId = id;
      operations = app.get(OperationsService);
    },
  };
}
