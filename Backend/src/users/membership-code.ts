import { Prisma } from '@prisma/client';

/** An old code identifies the same UUID; it never grants another account's rights. */
export async function matchesMembershipCode(
  tx: Prisma.TransactionClient,
  membership: { id: string; number: string } | null | undefined,
  code: string,
) {
  if (!membership) return false;
  if (membership.number === code) return true;
  const alias = await tx.membershipCodeAlias.findUnique({ where: { code } });
  return alias?.membershipId === membership.id;
}
