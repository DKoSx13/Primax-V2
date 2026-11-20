import type { ControlService } from '../../../../../src/control/control.service';
import type { AdministrativeSupervisionPort } from '../../application/ports/administrative-supervision';

export type ExistingAdministrativeSupervisionArguments = {
  dashboard: Parameters<ControlService['dashboard']>;
  incidents: Parameters<ControlService['incidents']>;
  incident: Parameters<ControlService['incident']>;
  incidentStatus: Parameters<ControlService['incidentStatus']>;
};
export type ExistingAdministrativeSupervisionViews = {
  dashboard: Awaited<ReturnType<ControlService['dashboard']>>;
  incidents: Awaited<ReturnType<ControlService['incidents']>>;
  incident: Awaited<ReturnType<ControlService['incident']>>;
  incidentStatus: Awaited<ReturnType<ControlService['incidentStatus']>>;
};

/** One invocation of the injected original engine; no retries, writes or transaction splitting. */
export class ExistingAdministrativeSupervision implements AdministrativeSupervisionPort<ExistingAdministrativeSupervisionArguments, ExistingAdministrativeSupervisionViews> {
  constructor(private readonly control: ControlService) {}
  dashboard(...args: ExistingAdministrativeSupervisionArguments['dashboard']) { return this.control.dashboard(...args); }
  incidents(...args: ExistingAdministrativeSupervisionArguments['incidents']) { return this.control.incidents(...args); }
  incident(...args: ExistingAdministrativeSupervisionArguments['incident']) { return this.control.incident(...args); }
  incidentStatus(...args: ExistingAdministrativeSupervisionArguments['incidentStatus']) { return this.control.incidentStatus(...args); }
}
