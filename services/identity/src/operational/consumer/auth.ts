import "reflect-metadata";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { AccessGuard } from "../../compatibility/auth/access.guard";
import { UsersService } from "../../compatibility/users/users.service";
import { UsersRepository } from "../../compatibility/users/users.repository";
import { KioskService } from "../../compatibility/kiosk/kiosk.service";
import { KioskStore } from "../../compatibility/kiosk/redis-store";
import { PrismaService } from "../../persistence/compatibility-db";
import { ContractFailure } from "../remote/contract";
import { ConsumerActor } from "./intent";

const controlHandler = () => {};
Reflect.defineMetadata("access", "control", controlHandler);
/** Laboratory Bearer-only workflow. Reuses the original guard, without modifying it.
 * Cookie authority is rejected; signed kiosk requests remain forbidden for Control.
 */
export class ConsumerAuthenticator {
  private readonly jwt: JwtService;
  private readonly kiosk: KioskService;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.jwt = new JwtService({
      secret: config.getOrThrow("JWT_SECRET"),
      verifyOptions: {
        issuer: "primax-v6",
        audience: "primax-prime",
        algorithms: ["HS256"],
      },
    });
    this.kiosk = new KioskService(config, new KioskStore(config), db);
  }
  async authenticate(
    req: Request & { actor?: ConsumerActor & { kind: string } },
  ): Promise<ConsumerActor> {
    if (
      req.headers.cookie ||
      !/^Bearer \S+$/i.test(req.header("authorization") || "")
    )
      throw new ContractFailure(401, "BEARER_REQUIRED");
    // Per-request capture: concurrent actors never share a mutable user/version slot.
    let verifiedUser: { id: string; authVersion: number } | undefined;
    const repository = {
      findById: async (id: string) => {
        const user = await this.db.user.findUnique({ where: { id } });
        verifiedUser = user || undefined;
        return user;
      },
    } as unknown as UsersRepository;
    const guard = new AccessGuard(
      new Reflector(),
      this.config,
      this.jwt,
      new UsersService(repository),
      this.kiosk,
      this.db,
    );
    await guard.canActivate({
      getHandler: () => controlHandler,
      getClass: () => ConsumerAuthenticator,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext);
    const actor = req.actor;
    if (actor?.kind !== "control" || !verifiedUser)
      throw new ContractFailure(403, "CONTROL_REQUIRED");
    return {
      ...actor,
      userId: verifiedUser.id,
      authVersion: verifiedUser.authVersion,
    };
  }
}
