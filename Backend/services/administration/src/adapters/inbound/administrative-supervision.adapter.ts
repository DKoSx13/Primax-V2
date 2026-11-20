import type { AdministrativeSupervision, AdministrativeSupervisionArguments, AdministrativeSupervisionViews } from '../../application/use-cases/administrative-supervision';
export type { AdministrativeSupervisionArguments, AdministrativeSupervisionViews } from '../../application/ports/administrative-supervision';

export class AdministrativeSupervisionAdapter<I extends AdministrativeSupervisionArguments, V extends AdministrativeSupervisionViews> {
  constructor(private readonly port: AdministrativeSupervision<I, V>) {}
  dashboard(...args: I['dashboard']) { return this.port.dashboard(...args); }
  incidents(...args: I['incidents']) { return this.port.incidents(...args); }
  incident(...args: I['incident']) { return this.port.incident(...args); }
  incidentStatus(...args: I['incidentStatus']) { return this.port.incidentStatus(...args); }
}
