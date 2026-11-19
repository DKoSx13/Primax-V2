import { Inject, Injectable } from '@nestjs/common';
import { LIST_BENEFITS_QUERY } from '../../application/ports/list-benefits-query';
import type { ListBenefitsQuery } from '../../application/ports/list-benefits-query';

/** Bridge for the current BenefitsService and the existing controller. */
@Injectable()
export class BenefitsReadAdapter {
  constructor(@Inject(LIST_BENEFITS_QUERY) private readonly query: ListBenefitsQuery) {}

  list() {
    return this.query.execute();
  }
}
