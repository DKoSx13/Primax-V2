import { Injectable } from '@nestjs/common';
import { BenefitsReadAdapter } from '../../services/catalog/src/adapters/inbound/benefits-read.adapter';
@Injectable()
export class BenefitsService {
  constructor(private readonly benefitsRead: BenefitsReadAdapter) {}
  list() {
    return this.benefitsRead.list();
  }
}
