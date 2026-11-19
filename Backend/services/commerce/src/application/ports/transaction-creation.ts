/** Structural compatibility contract. HTTP validation/defaults remain in the existing DTO. */
export interface TransactionCreationCommand {
  operationId: string;
  stationId: string;
  fuelId: string;
  plate: string;
  amount: string;
  mode: 'PREPAGO' | 'POSTPAGO';
  paymentMethod: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN' | 'SALDO_PRIME';
  receiptType: 'BOLETA' | 'FACTURA';
  unitPrice?: string;
  gallons?: string;
  authorizationId?: string;
  membershipCode?: string;
  outcome?: 'AUTO' | 'MANUAL';
  receiptDni?: string;
  receiptRuc?: string;
  receiptBusinessName?: string;
  saveReceiptProfile?: boolean;
}
/** The engine owns the complete original transaction; no transaction client crosses this port. */
export interface TransactionCreation<View> {
  create(command: TransactionCreationCommand): Promise<View>;
}
export const TRANSACTION_CREATION = Symbol('commerce.transaction-creation');
