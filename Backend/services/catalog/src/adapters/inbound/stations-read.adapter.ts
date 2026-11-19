import { Inject, Injectable } from '@nestjs/common';
import { LIST_STATIONS_QUERY } from '../../application/ports/list-stations-query';
import type { ListStationsQuery } from '../../application/ports/list-stations-query';

/** Bridge for the current StationsService and both existing controllers. */
@Injectable()
export class StationsReadAdapter {
  constructor(@Inject(LIST_STATIONS_QUERY) private readonly query: ListStationsQuery) {}

  list() {
    return this.query.execute();
  }
}
