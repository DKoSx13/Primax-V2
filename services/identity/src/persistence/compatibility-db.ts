import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { atomic } from "./atomic";

/** Explicit remaining kiosk/guard dependency. Separate restricted lab DB role. */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      datasources: {
        db: { url: config.getOrThrow("IDENTITY_COMPAT_DATABASE_URL") },
      },
    });
  }
  onModuleInit() {
    return this.$connect();
  }
  onModuleDestroy() {
    return this.$disconnect();
  }
  atomic<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { retryUnique?: boolean } = {},
  ) {
    return atomic(
      () =>
        this.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 10000,
        }),
      options.retryUnique !== false,
    );
  }
}
