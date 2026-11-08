import { Prisma } from '@prisma/client';
import { receiptResponse } from '../receipts/receipt.service';
export const transactionInclude = {
  receipt: true,
  vehicle: true,
  fuel: true,
  station: true,
  payment: true,
  debt: true,
  membership: {
    select: {
      id: true,
      number: true,
      userId: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.TransactionInclude;
export type TransactionModel = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;
export function transactionResponse(value: TransactionModel) {
  const { requestHash: _hash, membership, ...transaction } = value;
  return {
    ...transaction,
    receipt: receiptResponse(value.receipt),
    amount: value.amount.toFixed(2),
    membership: membership
      ? {
          id: membership.id,
          number: membership.number,
          name: membership.user.name,
        }
      : null,
  };
}
