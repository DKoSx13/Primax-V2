import { randomUUID } from "node:crypto";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import {
  OperationalSessionCommand,
  OperationalSessionPort,
  OperationalSessionResult,
} from "../port";
import {
  ContractFailure,
  fromReply,
  parseCommand,
  RemoteCommand,
} from "./contract";

/** Legacy port facade: each distinct legacy invocation is a new command.
 * Durable callers use execute/query with an explicit, stable commandId.
 * An ambiguous POST is followed by ONE query; POST is NEVER automatically replayed.
 */
export class RemoteOperationalSessions implements OperationalSessionPort {
  constructor(
    private readonly origin: string,
    private readonly apiKey: string,
    private readonly timeout = 4000,
  ) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !/^[a-f0-9]{64}$/.test(apiKey)
    )
      throw Error("Synthetic operational origin/key required");
  }
  private async post(path: string, command: RemoteCommand) {
    const response = await fetch(this.origin + path, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "x-operational-key": this.apiKey,
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(this.timeout),
    });
    const body = await response.json();
    if (!response.ok)
      throw new ContractFailure(
        response.status,
        String(body.code),
        String(body.message),
      );
    return fromReply(body, command.commandId.toLowerCase());
  }
  private fail(error: unknown): never {
    if (error instanceof ContractFailure && error.status === 409)
      throw new ConflictException(error.message);
    throw new ServiceUnavailableException(
      "Autenticación temporalmente no disponible",
    );
  }
  /** Only an authenticated 404 is absence; outages/corrupt replies never authorize a POST. */
  async lookup(
    input: RemoteCommand,
  ): Promise<OperationalSessionResult | undefined> {
    const command = parseCommand(input);
    try {
      return await this.post("/operational/v1/receipts/query", command);
    } catch (error) {
      if (
        error instanceof ContractFailure &&
        error.status === 404 &&
        error.code === "RECEIPT_NOT_FOUND"
      )
        return undefined;
      this.fail(error);
    }
  }
  async query(input: RemoteCommand): Promise<OperationalSessionResult> {
    const command = parseCommand(input);
    try {
      return await this.post("/operational/v1/receipts/query", command);
    } catch (error) {
      this.fail(error);
    }
  }
  async execute(input: RemoteCommand): Promise<OperationalSessionResult> {
    const command = parseCommand(input);
    try {
      return await this.post("/operational/v1/commands", command);
    } catch (error) {
      if (error instanceof ContractFailure && error.status < 500)
        this.fail(error);
      // 404 here does not prove that an in-flight command will never commit.
      try {
        return await this.post("/operational/v1/receipts/query", command);
      } catch (queryError) {
        this.fail(queryError);
      }
    }
  }
  issueOrResume(command: OperationalSessionCommand) {
    return this.execute({ version: 1, commandId: randomUUID(), command });
  }
}
