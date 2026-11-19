import type { StationReadModel } from '../station-read-model';

export interface StationListReader {
  list(): Promise<StationReadModel[]>;
}
