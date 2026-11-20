// Runs inside the disposable backend container at the browser's replay checkpoint.
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { assertCapturedContinuation } = require('./dist/src/transactions/captured-continuation');

async function check(db, request) {
  const { plainToInstance } = require('class-transformer');
  const { CreateAuthorizationDto } = require('./dist/src/transactions/create-authorization.dto');
  const { capturedContinuation, ...dto } = plainToInstance(CreateAuthorizationDto, request);
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const other = await tx.fuelAuthorization.findFirstOrThrow({
      where: { stationId: dto.stationId, operationId: { not: dto.operationId } },
    });
    const own = await tx.fuelAuthorization.findUniqueOrThrow({ where: { operationId: dto.operationId } });
    assert.notEqual(other.terminalId, own.terminalId);
    assert.notEqual(other.id, own.id);
    assert.equal(other.stationId, own.stationId);
    const invoke = repository => assertCapturedContinuation(repository, dto, capturedContinuation);
    const admitted = await invoke(tx);
    assert.equal(admitted.paymentId, own.paymentId);
    const tables = ['terminalOperation','onlineOrder','payment','inventoryReservation','transaction','station','fuel','paymentEvent'];
    const fixture = Object.fromEntries(tables.map(name => [name, tx[name]]));
    fixture.fuelAuthorization = { findUnique: async () => other };
    await assert.rejects(invoke(fixture), error =>
      error.getStatus?.() === 400 && error.message.includes('no corresponde a operationId'));
    console.log(JSON.stringify({sameStation:own.stationId, ownOperation:own.operationId, ownAuth:own.id,
      foreignOperation:other.operationId, foreignAuth:other.id, ownPayment:own.paymentId, foreignPayment:other.paymentId,
      admitted:true, rejectedStatus:400, transaction:'READ ONLY', substituted:'fuelAuthorization.findUnique'}));
  });
}

const db = new PrismaClient();
check(db, JSON.parse(process.env.LOT5_BROWSER_REQUEST)).catch(error => {
  console.error(error); process.exitCode = 1;
}).finally(() => db.$disconnect());
