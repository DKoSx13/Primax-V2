import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { OperationsService } from '../src/operations/operations.service';

/** Test-only gateway boundary. AccessGuard still checks persisted terminal binding. */
export function technicalSaleFixture(db: PrismaClient) {
  let stationId = '';
  let supervisorId = '';
  let shiftId = '';
  let operations: OperationsService;
  let ready: Promise<void> | undefined;
  const prepared = new Map<string, Promise<string>>();

  const gateway = {
    authorize: async (req: Request) => {
      const operationId = (req.body as { operationId?: unknown })?.operationId;
      if (typeof operationId === 'string' && /^[0-9a-f-]{36}$/i.test(operationId)) {
        let token = prepared.get(operationId);
        if (!token) {
          token = (async () => {
            if (!ready) ready = (async () => {
              const supervisor = await db.user.create({
                data: { email: `${randomUUID()}@example.test`, name: 'Technical sale fixture', passwordHash: 'fixture' },
              });
              supervisorId = supervisor.id;
              await operations.assignSupervisor(supervisorId, stationId, 'E2E technical fixture');
              shiftId = (await operations.openShift(supervisorId, stationId)).id;
            })();
            await ready;
            const pump = await operations.createPump(stationId, `T${randomUUID().slice(0, 8)}`, 'E2E pump');
            const terminal = await operations.createTerminal(stationId, `T${randomUUID().slice(0, 8)}`);
            await operations.assignTerminal(terminal.id, pump.id);
            await operations.enable(supervisorId, terminal.id, shiftId);
            const credential = await operations.issueCredential(supervisorId, terminal.id);
            await operations.startOperation(terminal.id, operationId);
            return credential.token;
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
