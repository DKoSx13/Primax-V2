export interface BenefitReadModel {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  pointsCost: number;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}
