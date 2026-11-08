import { bootstrapDomain } from '../bootstrap';
import { TransactionsModule } from '../../transactions/transactions.module';
import { OperationsModule } from '../../operations/operations.module';
import { AssistanceModule } from '../../assistance/assistance.module';

// Payments, wallet, receipts and loyalty remain one atomic business boundary.
void bootstrapDomain('commerce-service', [TransactionsModule, OperationsModule, AssistanceModule]);
