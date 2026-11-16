import { Injectable } from "@nestjs/common";
import { AlertsPort } from "../ports";
import { CompatibilityPort } from "./compatibility-port";

@Injectable()
export class AlertsService implements AlertsPort {
  constructor(private readonly port: CompatibilityPort) {}
  list() {
    return this.port.call("alerts/list");
  }
  dashboard() {
    return this.port.call("alerts/dashboard");
  }
  resolve(id: string, actor: string) {
    return this.port.call("alerts/resolve", { id, actor });
  }
  checkPlate(plate: string, code: string, operationId: string) {
    return this.port.call("alerts/check-plate", { plate, code, operationId });
  }
}
