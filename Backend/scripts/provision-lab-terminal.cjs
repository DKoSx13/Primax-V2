// Add only the second demonstration terminal to the isolated feria laboratory.
const { PrismaClient } = require('@prisma/client');
const { assertLocalDatabase } = require('./database-safety.cjs');

async function main() {
  assertLocalDatabase();
  const database = new URL(process.env.DATABASE_URL);
  if (process.env.PRIMAX_LAB_PROJECT !== 'primax-feria-check' ||
      process.env.APP_MODE !== 'local' || database.hostname !== 'postgres' ||
      database.pathname !== '/primax_v12_1_local')
    throw Error('Provisioning is restricted to the isolated feria laboratory');

  const db = new PrismaClient();
  try {
    const result = await db.$transaction(async (tx) => {
      const station = await tx.station.findUnique({ where: { code: 'PRIMAX-SUR' } });
      if (!station?.active) throw Error('PRIMAX-SUR must exist and be active');
      const t01 = await tx.terminal.findUnique({ where: { stationId_code: { stationId: station.id, code: 'PRIMAX-SUR-T01' } } });
      const pump03 = await tx.pump.findUnique({ where: { stationId_code: { stationId: station.id, code: '03' } } });
      const t01Assignment = t01 && await tx.terminalPumpAssignment.findFirst({ where: { terminalId: t01.id, endedAt: null } });
      if (!t01 || !pump03 || t01Assignment?.pumpId !== pump03.id)
        throw Error('T01 must already be assigned to pump 03');

      let pump = await tx.pump.findUnique({ where: { stationId_code: { stationId: station.id, code: '04' } } });
      if (!pump) pump = await tx.pump.create({ data: { stationId: station.id, code: '04', name: 'Surtidor 04' } });
      if (!pump.active) throw Error('Pump 04 is inactive');
      let terminal = await tx.terminal.findUnique({ where: { stationId_code: { stationId: station.id, code: 'PRIMAX-SUR-T02' } } });
      if (!terminal) terminal = await tx.terminal.create({ data: { stationId: station.id, code: 'PRIMAX-SUR-T02', operationalStatus: 'DISPONIBLE' } });
      if (terminal.lifecycle !== 'REGISTRADA') throw Error('T02 is not registered');
      let assignment = await tx.terminalPumpAssignment.findFirst({ where: { terminalId: terminal.id, endedAt: null } });
      const other = await tx.terminalPumpAssignment.findFirst({ where: { pumpId: pump.id, endedAt: null } });
      if (other && other.terminalId !== terminal.id) throw Error('Pump 04 is assigned to another terminal');
      if (assignment && assignment.pumpId !== pump.id) throw Error('T02 is assigned to another pump');
      if (!assignment) assignment = await tx.terminalPumpAssignment.create({ data: { stationId: station.id, terminalId: terminal.id, pumpId: pump.id } });
      return { station: station.code, terminal: terminal.code, pump: pump.code, assignmentId: assignment.id };
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
