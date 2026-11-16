import { ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { documentConflict } from "../compatibility/common/document-conflict";
import { persistenceError } from "./errors";

/** Existing serializable retry policy; no domain or monetary operations here. */
export async function atomic<T>(
  work: () => Promise<T>,
  retryUnique = true,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await work();
    } catch (original) {
      const error = persistenceError(original);
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      if (documentConflict(error)) throw error;
      if (
        !(
          error.code === "P2034" ||
          (retryUnique && error.code === "P2002") ||
          (error.code === "P2010" &&
            ["40001", "40P01"].includes(String(error.meta?.code)))
        )
      )
        throw error;
      if (attempt === 4)
        throw new ServiceUnavailableException(
          "Conflicto temporal; reintenta con el mismo operationId",
        );
      await new Promise((resolve) =>
        setTimeout(resolve, 50 * 2 ** attempt + Math.random() * 40),
      );
    }
  }
  throw new ServiceUnavailableException();
}
