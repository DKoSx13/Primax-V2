import type { BenefitReadModel } from '../benefit-read-model';

export const LIST_BENEFITS_QUERY = Symbol('catalog.list-benefits');

export interface ListBenefitsQuery {
  execute(): Promise<BenefitReadModel[]>;
}
