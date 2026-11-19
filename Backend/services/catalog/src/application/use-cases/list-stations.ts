import type { StationListReader } from '../ports/station-list-reader';
import type { ListStationsQuery } from '../ports/list-stations-query';

export class ListStations implements ListStationsQuery {
  constructor(private readonly reader: StationListReader) {}

  execute() {
    return this.reader.list();
  }
}
