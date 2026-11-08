import { bootstrapDomain } from '../bootstrap';
import { ControlModule } from '../../control/control.module';

void bootstrapDomain('administration-service', [ControlModule]);
