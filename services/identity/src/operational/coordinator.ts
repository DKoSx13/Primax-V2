import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { KioskService } from "../compatibility/kiosk/kiosk.service";
import { OPERATIONAL_SESSION, OperationalSessionPort } from "./port";

type LegacyReply = Awaited<ReturnType<KioskService["bootstrapTerminal"]>>;
type SessionReply = Omit<
  LegacyReply,
  "terminalId" | "terminalToken" | "terminalExpiresAt"
>;

/** Narrow compatibility adapter to the existing post-commit Redis issuer.
 * Its private TS method is an ordinary runtime method in the frozen class.
 * This preserves keys/TTL/CSRF instead of duplicating the session algorithm.
 */
@Injectable()
export class LegacyKioskSessionIssuer {
  constructor(private readonly kiosk: KioskService) {}
  issue(): Promise<SessionReply> {
    const existing = this.kiosk as unknown as {
      create(authenticated: boolean): Promise<SessionReply>;
    };
    return existing.create(true);
  }
}

@Injectable()
export class OperationalSessionCoordinator {
  constructor(
    private readonly kiosk: KioskService,
    private readonly config: ConfigService,
    @Inject(OPERATIONAL_SESSION)
    private readonly operations: OperationalSessionPort,
    private readonly sessions: LegacyKioskSessionIssuer,
  ) {}
  async bootstrap(
    req: Request,
    terminalId?: string,
    terminalCode?: string,
  ): Promise<LegacyReply> {
    this.kiosk.verifyGateway(req);
    await this.kiosk.limitTechnical(req);
    const result = await this.operations.issueOrResume({
      contractVersion: 1,
      stationId: this.config.getOrThrow<string>("KIOSK_STATION_ID"),
      terminalId,
      terminalCode,
      previousCredential: req.header("x-terminal-session") || "",
    });
    // Existing ordering: PostgreSQL commit first, Redis session second. No replay.
    const session = await this.sessions.issue();
    return {
      ...session,
      terminalId: result.terminalId,
      terminalToken: result.terminalToken,
      terminalExpiresAt: result.expiresAt,
    };
  }
}
