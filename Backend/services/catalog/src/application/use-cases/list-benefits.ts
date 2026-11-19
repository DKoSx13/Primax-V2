import type { BenefitListReader } from '../ports/benefit-list-reader';
import type { ListBenefitsQuery } from '../ports/list-benefits-query';

export class ListBenefits implements ListBenefitsQuery {
  constructor(private readonly reader: BenefitListReader) {}

  execute() {
    return this.reader.list();
  }
}
