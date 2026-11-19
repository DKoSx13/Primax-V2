import type { FuelReadModel } from '../fuel-read-model';

export const LIST_FUELS_QUERY = Symbol('catalog.list-fuels');

export interface ListFuelsQuery {
  execute(): Promise<FuelReadModel[]>;
}
