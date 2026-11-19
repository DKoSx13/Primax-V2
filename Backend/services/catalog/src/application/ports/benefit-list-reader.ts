import type { BenefitReadModel } from '../benefit-read-model';

export interface BenefitListReader {
  list(): Promise<BenefitReadModel[]>;
}
