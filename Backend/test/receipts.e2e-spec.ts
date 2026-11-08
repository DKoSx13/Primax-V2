import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaClient, ReceiptType } from '@prisma/client';
import { receiptResponse } from '../src/receipts/receipt.service';

describe('persistent academic receipt numbering in isolated PostgreSQL', () => {
  let db: PrismaClient, stationId: string, fuelId: string;
  const schema = 'receipts_' + randomUUID().replaceAll('-', '');
  const issue = async (type: ReceiptType, operationId: string = randomUUID()) => db.transaction.create({
    data: { operationId, requestHash: 'a'.repeat(64), plate: 'ABC-123', stationId, fuelId,
      amount: '21.30', unitPrice: '21.30', gallons: '1.000', pointsRate: '0.1111',
      pointsEarned: 0, mode: 'PREPAGO', receiptType: type },
    include: { receipt: true },
  });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'),'migrate','deploy'], {
      env: { ...process.env, DATABASE_URL: url.href, DATABASE_URL_UNPOOLED: url.href }, stdio: 'pipe',
    });
    db = new PrismaClient({ datasourceUrl: url.href });
    stationId = (await db.station.create({data:{code:'RECEIPTS',name:'Isolated receipt fixture',address:'Local'}})).id;
    fuelId = (await db.fuel.create({data:{code:'REGULAR',name:'Regular',pricePerGallon:'21.30'}})).id;
  }, 60000);
  afterAll(async () => db?.$disconnect());

  it('interleaves three boletas and three facturas with independent counters', async () => {
    const numbers: string[] = [];
    for (let i=0;i<3;i++) for (const type of ['BOLETA','FACTURA'] as const)
      numbers.push((await issue(type)).receipt!.number);
    expect(numbers).toEqual(['EB01-0001','FT01-0001','EB01-0002','FT01-0002','EB01-0003','FT01-0003']);
  });
  it('assigns unique numbers to concurrent transactions and exposes string-safe contracts', async () => {
    const sales = await Promise.all(Array.from({length:24},(_,i)=>issue(i%2?'FACTURA':'BOLETA')));
    expect(new Set(sales.map(s=>s.receipt!.number)).size).toBe(24);
    expect(sales.every(s=>s.receipt!.transactionId===s.id)).toBe(true);
    expect(()=>JSON.stringify(sales.map(s=>receiptResponse(s.receipt)))).not.toThrow();
  });
  it('does not issue again on read, replay, print or cancellation/refund state changes', async () => {
    const sale = await issue('BOLETA'); const count=await db.receipt.count();
    const replay = await db.transaction.findUniqueOrThrow({where:{operationId:sale.operationId},include:{receipt:true}});
    expect(replay.receipt!.number).toBe(sale.receipt!.number);
    await expect(issue('BOLETA',sale.operationId)).rejects.toThrow();
    expect(await db.receipt.count()).toBe(count);
    await db.transaction.update({where:{id:sale.id},data:{status:'REFUNDED'}});
    expect((await db.receipt.findUniqueOrThrow({where:{transactionId:sale.id}})).number).toBe(sale.receipt!.number);
  });
  it('never reuses a number allocated inside a rolled-back transaction', async () => {
    let abandoned=0n;
    await expect(db.$transaction(async tx=>{
      const sale=await tx.transaction.create({data:{operationId:randomUUID(),requestHash:'b'.repeat(64),plate:'ABC-123',stationId,fuelId,amount:'21.30',unitPrice:'21.30',gallons:'1',pointsRate:'0.1111',pointsEarned:0,mode:'PREPAGO'},include:{receipt:true}});
      abandoned=sale.receipt!.correlative;
      throw Error('ROLLBACK_FIXTURE');
    })).rejects.toThrow('ROLLBACK_FIXTURE');
    expect((await issue('BOLETA')).receipt!.correlative).toBeGreaterThan(abandoned);
  });
  it('keeps series beyond 9999 and survives a new database connection', async () => {
    // Dedicated random schema only: never reset an application sequence.
    for (const [type,sequence,prefix] of [['BOLETA','receipt_boleta_seq','EB01'],['FACTURA','receipt_factura_seq','FT01']] as const) {
      await db.$queryRawUnsafe(`SELECT setval('"${schema}".${sequence}',9999,true)`);
      const first=(await issue(type)).receipt!;
      expect(first.number).toBe(prefix+'-10000');
      await db.$disconnect(); await db.$connect();
      expect((await issue(type)).receipt!.number).toBe(prefix+'-10001');
    }
  });
  it('rejects changes/deletion of issued documents and changes of document type', async () => {
    const sale=await issue('BOLETA');
    await expect(db.receipt.update({where:{transactionId:sale.id},data:{number:'EB01-999999'}})).rejects.toThrow();
    await expect(db.receipt.delete({where:{transactionId:sale.id}})).rejects.toThrow();
    await expect(db.transaction.update({where:{id:sale.id},data:{receiptType:'FACTURA'}})).rejects.toThrow();
    expect((await db.receipt.findUniqueOrThrow({where:{transactionId:sale.id}})).number).toBe(sale.receipt!.number);
  });
});
