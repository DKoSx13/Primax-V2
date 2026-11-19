import type { KioskService } from '../../../../src/kiosk/kiosk.service';
import { KioskSessionOperations } from '../application/use-cases/kiosk-session-operations';
import { KioskSessionOperationsAdapter } from '../adapters/inbound/kiosk-session-operations.adapter';
import { ExistingKioskSessionOperations, ExistingKioskSessionOperationsArguments, ExistingKioskSessionOperationsViews } from '../adapters/outbound/existing-kiosk-session-operations';

/** Wrap existing injected engines; keep their transactions and technical effects intact. */
export function composeKioskSessionOperations(kiosk: KioskService) {
  return new KioskSessionOperationsAdapter(new KioskSessionOperations<ExistingKioskSessionOperationsArguments, ExistingKioskSessionOperationsViews>(new ExistingKioskSessionOperations(kiosk)));
}
