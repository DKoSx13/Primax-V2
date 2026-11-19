import { Inject, Injectable } from '@nestjs/common';
import { LIST_FUELS_QUERY } from '../../application/ports/list-fuels-query';
import type { ListFuelsQuery } from '../../application/ports/list-fuels-query';

/** Bridge for the existing FuelsService/controller; declares no new route. */
@Injectable()
export class FuelsReadAdapter {
  constructor(@Inject(LIST_FUELS_QUERY) private readonly query: ListFuelsQuery) {}

  list() {
    return this.query.execute();
  }
}
