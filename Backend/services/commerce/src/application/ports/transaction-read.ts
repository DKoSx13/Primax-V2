import type { Actor } from '../../../../../src/identity-core/domain';
export type TransactionReaderActor = Actor;
export interface TransactionReadSource<View> {
  get(id: string, actor: TransactionReaderActor): Promise<View>;
}
export const TRANSACTION_READ = Symbol('commerce.transaction-read');
