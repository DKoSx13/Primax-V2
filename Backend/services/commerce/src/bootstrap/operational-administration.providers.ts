import type { Provider } from '@nestjs/common';
import { OPERATIONAL_ADMINISTRATION } from '../application/ports/operational-administration';
import { OperationalAdministration } from '../application/use-cases/operational-administration';
import { OperationalAdministrationAdapter } from '../adapters/inbound/operational-administration.adapter';
import { ExistingOperationalAdministration, ExistingOperationalAdministrationArguments, ExistingOperationalAdministrationViews } from '../adapters/outbound/existing-operational-administration';

export const operationalAdministrationProviders: Provider[] = [
  ExistingOperationalAdministration,
  { provide: OPERATIONAL_ADMINISTRATION, inject: [ExistingOperationalAdministration],
    useFactory: (engine: ExistingOperationalAdministration) => new OperationalAdministration<ExistingOperationalAdministrationArguments, ExistingOperationalAdministrationViews>(engine) },
  OperationalAdministrationAdapter,
];
