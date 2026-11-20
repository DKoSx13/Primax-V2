import type { ControlOperationsService } from '../../../../src/control/control-operations.service';
import { OperationalSupervision } from '../application/use-cases/operational-supervision';
import { OperationalSupervisionAdapter } from '../adapters/inbound/operational-supervision.adapter';
import { ExistingOperationalSupervision, ExistingOperationalSupervisionArguments, ExistingOperationalSupervisionViews } from '../adapters/outbound/existing-operational-supervision';

export function composeOperationalSupervision(operations: ControlOperationsService) {
  return new OperationalSupervisionAdapter(new OperationalSupervision<ExistingOperationalSupervisionArguments, ExistingOperationalSupervisionViews>(new ExistingOperationalSupervision(operations)));
}
