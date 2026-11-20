import type { ControlService } from '../../../../src/control/control.service';
import { AdministrativeSupervision } from '../application/use-cases/administrative-supervision';
import { AdministrativeSupervisionAdapter } from '../adapters/inbound/administrative-supervision.adapter';
import { ExistingAdministrativeSupervision, ExistingAdministrativeSupervisionArguments, ExistingAdministrativeSupervisionViews } from '../adapters/outbound/existing-administrative-supervision';

export function composeAdministrativeSupervision(control: ControlService) {
  return new AdministrativeSupervisionAdapter(new AdministrativeSupervision<ExistingAdministrativeSupervisionArguments, ExistingAdministrativeSupervisionViews>(new ExistingAdministrativeSupervision(control)));
}
