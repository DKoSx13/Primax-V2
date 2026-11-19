/** Transport validation and defaults remain in the original DTO. */
export interface AuthorizationCreationCommand {
  operationId: string;
  stationId: string;
  fuelId: string;
  plate: string;
  amount: string;
  receiptType: 'BOLETA' | 'FACTURA';
  mode?: 'PREPAGO' | 'POSTPAGO';
  paymentMethod?: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN' | 'SALDO_PRIME';
  unitPrice?: string;
  membershipCode?: string;
  allowDebt?: boolean;
}
export interface AuthorizationProgressCommand { amount: string; gallons: string }
export interface AuthorizationCommandViews { create: unknown; progress: unknown; release: unknown; intervention: unknown }
export interface AuthorizationCommandEngine<V extends AuthorizationCommandViews> {
  create(command: AuthorizationCreationCommand): Promise<V['create']>;
  progress(id: string, command: AuthorizationProgressCommand): Promise<V['progress']>;
  release(id: string): Promise<V['release']>;
  intervention(id: string): Promise<V['intervention']>;
}
export const AUTHORIZATION_COMMANDS = Symbol('commerce.authorization-commands');
