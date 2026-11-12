import { Benefit, Fuel, Inventory, Station } from '../domain/catalog';

export interface CatalogReader {
  fuels(): Promise<Fuel[]>;
  stations(): Promise<Station[]>;
  benefits(): Promise<Benefit[]>;
  inventory(): Promise<Inventory[]>;
  ready(): Promise<void>;
}

/** No Nest, transport or persistence dependencies in the use cases. */
export class Catalog {
  constructor(private readonly reader: CatalogReader) {}
  fuels() { return this.reader.fuels(); }
  stations(stationId?: string) {
    return this.reader.stations().then(rows => stationId ? rows.filter(r => r.id === stationId) : rows);
  }
  benefits() { return this.reader.benefits(); }
  inventory(stationId?: string) {
    return this.reader.inventory().then(rows => stationId ? rows.filter(r => r.stationId === stationId) : rows);
  }
  ready() { return this.reader.ready(); }
}
