import type { StationReadModel } from '../station-read-model';

export const LIST_STATIONS_QUERY = Symbol('catalog.list-stations');

export interface ListStationsQuery {
  execute(): Promise<StationReadModel[]>;
}
