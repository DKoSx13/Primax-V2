import { Prisma as IdentityPrisma } from "../../generated/identity";
import { Prisma } from "@prisma/client";

/** Generated clients carry distinct runtime classes. Preserve the known error
 * contract at the persistence boundary; never classify arbitrary objects by code.
 */
export function persistenceError(error: unknown): unknown {
  if (error instanceof IdentityPrisma.PrismaClientKnownRequestError)
    return new Prisma.PrismaClientKnownRequestError(error.message, {
      code: error.code,
      clientVersion: error.clientVersion,
      meta: error.meta,
    });
  return error;
}
