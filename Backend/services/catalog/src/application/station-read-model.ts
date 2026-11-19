/** Existing station read shape; values pass through without mapping. */
export interface StationReadModel {
  id: string;
  code: string;
  name: string;
  address: string;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}
