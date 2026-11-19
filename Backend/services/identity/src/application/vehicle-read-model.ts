/** Existing scalar read representation; no ownership or financial mutation. */
export interface VehicleReadModel {
  id: string;
  plate: string;
  label: string;
  membershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface VehiclePage { page: number; limit: number }
export type VehicleListResult = Promise<VehicleReadModel[]> | VehicleReadModel[];
