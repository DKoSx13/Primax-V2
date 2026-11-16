/** No SQL, arithmetic or financial commands cross these compatibility ports. */
export interface FinancialReads {
  membershipMe(userId: string): Promise<unknown>;
  membershipHistory(
    kind: "transactions" | "rewards" | "redemptions",
    userId: string,
    query: { page: number; limit: number },
  ): Promise<unknown>;
  vehicleView(
    plate: string,
    actor: { kind: string; userId?: string },
  ): Promise<unknown>;
}
export interface AlertsPort {
  list(): Promise<unknown>;
  dashboard(): Promise<unknown>;
  resolve(id: string, actor: string): Promise<unknown>;
  checkPlate(
    plate: string,
    code: string,
    operationId: string,
  ): Promise<unknown>;
}
