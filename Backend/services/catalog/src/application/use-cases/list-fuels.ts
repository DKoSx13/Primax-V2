import type { FuelListReader } from '../ports/fuel-list-reader';
import type { ListFuelsQuery } from '../ports/list-fuels-query';

export class ListFuels implements ListFuelsQuery {
  constructor(private readonly reader: FuelListReader) {}

  execute() {
    return this.reader.list();
  }
}
