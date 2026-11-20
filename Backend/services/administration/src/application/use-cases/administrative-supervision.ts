import type { AdministrativeSupervisionPort, AdministrativeSupervisionArguments, AdministrativeSupervisionViews } from '../ports/administrative-supervision';

export class AdministrativeSupervision<I extends AdministrativeSupervisionArguments, V extends AdministrativeSupervisionViews> {
  constructor(private readonly port: AdministrativeSupervisionPort<I, V>) {}
  dashboard(...args: I['dashboard']) { return this.port.dashboard(...args); }
  incidents(...args: I['incidents']) { return this.port.incidents(...args); }
  incident(...args: I['incident']) { return this.port.incident(...args); }
  incidentStatus(...args: I['incidentStatus']) { return this.port.incidentStatus(...args); }
}
export type { AdministrativeSupervisionArguments, AdministrativeSupervisionViews } from '../ports/administrative-supervision';
