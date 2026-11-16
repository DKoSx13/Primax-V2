import { Injectable } from "@nestjs/common";
import { FinancialReads } from "../ports";
import { CompatibilityPort } from "./compatibility-port";

@Injectable()
export class RemoteFinancialReads implements FinancialReads {
  constructor(private readonly port: CompatibilityPort) {}
  membershipMe(userId: string) {
    return this.port.call("finance/me", { userId });
  }
  membershipHistory(
    kind: "transactions" | "rewards" | "redemptions",
    userId: string,
    query: { page: number; limit: number },
  ) {
    return this.port.call("finance/" + kind, { userId, query });
  }
  vehicleView(plate: string, actor: { kind: string; userId?: string }) {
    return this.port.call("finance/vehicle", { plate, actor });
  }
}
