import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { assertCapturedContinuation } from './captured-continuation';
import type { AuthorizationCreationCommand } from '../../services/commerce/src/application/ports/authorization-commands';

const decimal = (n: string | number) => new Prisma.Decimal(n);
function fixture() {
  const dto: AuthorizationCreationCommand = { plate:'CNT-601', mode:'PREPAGO', paymentMethod:'YAPE', unitPrice:'20.00', allowDebt:false, operationId:'op', amount:'20.00', stationId:'station', fuelId:'fuel', receiptType:'BOLETA' };
  const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const request = { orderId:'order', paymentId:'payment', amount:'20.00', currency:'PEN' as const };
  const payment = { id:'payment', operationId:'op', requestHash:hash({...dto,plate:'CNT-601',amount:'20.00'}), status:'CAPTURED', method:'YAPE', amount:decimal(20), originalAmount:decimal(20), unitPrice:decimal(20), refundedAmount:decimal(0), transactionId:null, provider:'DEMO' };
  const order = { id:'order', operationId:'op', paymentId:'payment', status:'CAPTURED', method:'YAPE', amount:decimal(20), providerId:'demo:order', requestHash:hash({operationId:'op',method:'YAPE',authorization:dto}), userId:null, transactionId:null };
  const reservation = { source:'TERMINAL', terminalOperationId:'operation', stationId:'station', fuelId:'fuel', requestHash:payment.requestHash, status:'PENDING_PAYMENT', transactionId:null, authorizationId:null as string|null, initialLiters:decimal(1), remainingLiters:decimal(1), consumedLiters:decimal(0), releasedLiters:decimal(0) };
  const operation = { id:'operation', operationId:'op', stationId:'station', terminalId:'terminal', pumpId:'pump', terminalPumpAssignmentId:'assignment', status:'ACTIVE', closedAt:null, terminal:{stationId:'station',lifecycle:'REGISTRADA'}, pump:{stationId:'station',active:true}, terminalPumpAssignment:{stationId:'station',terminalId:'terminal',pumpId:'pump',endedAt:null}, enablement:null };
  const events: Record<string,any> = {
    'demo-confirm:order':{orderId:'order',kind:'DEMO_PAID',detail:JSON.stringify({id:'demo:order',order_number:'order',amount:2000,currency_code:'PEN',state:'paid',paid_at:123})},
    'capture:order':{orderId:'order',paymentId:'payment',kind:'CAPTURED'},
  };
  const data = { dto,request,payment,order,reservation,operation,events,auth:null as any,sale:null as any };
  const tx = {
    terminalOperation:{findUnique:jest.fn(async()=>data.operation)},
    onlineOrder:{findUnique:jest.fn(async({where})=>where.id===order.id?order:null)},
    payment:{findUnique:jest.fn(async({where})=>where.id===payment.id?payment:null)},
    inventoryReservation:{findUnique:jest.fn(async()=>reservation)},
    fuelAuthorization:{findUnique:jest.fn(async()=>data.auth)}, transaction:{findFirst:jest.fn(async()=>data.sale)},
    station:{findUnique:jest.fn(async()=>({active:true}))},fuel:{findUnique:jest.fn(async()=>({active:true,pricePerGallon:decimal(20)}))},
    paymentEvent:{findUnique:jest.fn(async({where})=>events[where.eventKey]||null)},
  };
  return {...data,data,tx:tx as unknown as Prisma.TransactionClient};
}
test('admits only a correlated captured payment and an untouched terminal reservation',async()=>{
  const f=fixture();await expect(assertCapturedContinuation(f.tx,f.dto,f.request)).resolves.toEqual({orderId:'order',paymentId:'payment'});
});
const negatives: [string,(f:ReturnType<typeof fixture>)=>void][] = [
  ['missing order reference',f=>{f.request.orderId='unknown';}],
  ['wrong payment reference',f=>{f.request.paymentId='unknown';}],
  ['wrong operation',f=>{f.order.operationId='foreign';}],
  ['wrong amount',f=>{f.request.amount='21.00';}],
  ['wrong currency',f=>{(f.request as any).currency='USD';}],
  ['unconfirmed payment',f=>{f.payment.status='PENDING';}],
  ['refund',f=>{f.payment.refundedAmount=decimal(1);}],
  ['payment already used',f=>{(f.payment as any).transactionId='sale';}],
  ['sale or receipt final',f=>{f.data.sale={id:'sale',receipt:{number:'EB01-0001'}};}],
  ['customer-owned order',f=>{(f.order as any).userId='member';}],
  ['wrong station',f=>{f.reservation.stationId='foreign';}],
  ['wrong terminal',f=>{f.reservation.terminalOperationId='foreign';}],
  ['closed operation',f=>{(f.operation as any).closedAt=new Date();}],
  ['invalid reserve review',f=>{f.reservation.status='REVIEW';}],
  ['closed reserve',f=>{f.reservation.status='CLOSED';}],
  ['cancelled reserve',f=>{f.reservation.status='CANCELLED';}],
  ['consumed reserve',f=>{f.reservation.consumedLiters=decimal('0.1');}],
  ['released reserve',f=>{f.reservation.releasedLiters=decimal('0.1');}],
  ['tampered original request',f=>{f.dto.plate='CNT-602';}],
  ['missing persistent capture',f=>{delete f.events['capture:order'];}],
  ['contradictory provider terminal event',f=>{f.events['demo-terminal:order']={kind:'DEMO_REFUNDED'};}],
  ['unknown provider reference',f=>{f.order.providerId='demo:other';}],
  ['wrong provider amount',f=>{const r=JSON.parse(f.events['demo-confirm:order'].detail);r.amount=2100;f.events['demo-confirm:order'].detail=JSON.stringify(r);}],
  ['wrong provider currency',f=>{const r=JSON.parse(f.events['demo-confirm:order'].detail);r.currency_code='USD';f.events['demo-confirm:order'].detail=JSON.stringify(r);}],
  ['commercial evidence unavailable',f=>{f.payment.provider='CULQI';}],
  ['malformed provider proof',f=>{f.events['demo-confirm:order'].detail='bad';}],
  ['existing unrelated authorization',f=>{f.data.auth={...f.payment,id:'authorization',status:'RESERVED',stationId:'station',fuelId:'fuel',dispensedAmount:decimal(0),dispensedGallons:decimal(0)};}],
];
test.each(negatives)('rejects %s without financial effects',async(_name,change)=>{const f=fixture();change(f);await expect(assertCapturedContinuation(f.tx,f.dto,f.request)).rejects.toThrow();});
function replayFixture() {
  const f=fixture();f.data.auth={id:'authorization',operationId:'op',stationId:'station',fuelId:'fuel',terminalOperationId:'operation',terminalId:'terminal',pumpId:'pump',terminalPumpAssignmentId:'assignment',paymentId:'payment',requestHash:f.payment.requestHash,status:'RESERVED',dispensedAmount:decimal(0),dispensedGallons:decimal(0),consumedAmount:null};
  f.reservation.status='ACTIVE';f.reservation.authorizationId='authorization';
  f.events['captured-continuation:op']={orderId:'order',paymentId:'payment',kind:'CAPTURED_CONTINUED',detail:JSON.stringify({authorizationId:'authorization'})};return f;
}
test('admits replay only of the same untouched continuation authorization',async()=>{const f=replayFixture();await expect(assertCapturedContinuation(f.tx,f.dto,f.request)).resolves.toBeDefined();});
test('rejects an otherwise identical authorization when the continuation event records a different authorization',async()=>{
  const f=replayFixture();
  f.events['captured-continuation:op'].detail=JSON.stringify({authorizationId:'different-authorization'});
  await expect(assertCapturedContinuation(f.tx,f.dto,f.request)).rejects.toMatchObject({status:409});
});
test.each(['terminalOperationId','terminalId','pumpId','terminalPumpAssignmentId'])('rejects a replay without its persisted %s',async field=>{
  const f=replayFixture();
  f.data.auth[field]=null;
  await expect(assertCapturedContinuation(f.tx,f.dto,f.request)).rejects.toThrow();
});
test.each(['DISPENSING','SETTLED','RELEASED','INTERVENTION_REQUIRED'])('rejects consumed/existing authorization %s',async status=>{const f=replayFixture();f.data.auth.status=status;await expect(assertCapturedContinuation(f.tx,f.dto,f.request)).rejects.toThrow();});
