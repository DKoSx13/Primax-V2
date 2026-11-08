import { bootstrapDomain } from '../bootstrap';
import { FuelsModule } from '../../fuels/fuels.module';
import { StationsModule } from '../../stations/stations.module';
import { BenefitsModule } from '../../benefits/benefits.module';

void bootstrapDomain('catalog-service', [FuelsModule, StationsModule, BenefitsModule]);
