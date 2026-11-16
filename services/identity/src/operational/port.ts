/** V1 command boundary. Caller verifies gateway signature and trusted station.
 * Provider owns the WHOLE PostgreSQL transaction, including operation and audit.
 * No caller-supplied transaction, SQL, fault flags or distributed commit.
 */
export interface OperationalSessionCommand {
  contractVersion: 1;
  stationId: string;
  terminalId?: string;
  terminalCode?: string;
  previousCredential?: string;
}
export interface OperationalSessionResult {
  terminalId: string;
  terminalToken: string;
  expiresAt: Date;
}
export interface OperationalSessionPort {
  issueOrResume(
    command: OperationalSessionCommand,
  ): Promise<OperationalSessionResult>;
}
export const OPERATIONAL_SESSION = Symbol("OperationalSessionPort.v1");
