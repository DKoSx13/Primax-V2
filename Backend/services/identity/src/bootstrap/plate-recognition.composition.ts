import type { RecognitionService } from '../../../../src/vehicles/recognition.service';
import { PlateRecognition } from '../application/use-cases/plate-recognition';
import { PlateRecognitionAdapter } from '../adapters/inbound/plate-recognition.adapter';
import { ExistingPlateRecognition, ExistingPlateRecognitionArguments, ExistingPlateRecognitionViews } from '../adapters/outbound/existing-plate-recognition';

/** Compose wrappers around existing Nest-injected instances; never instantiate engines. */
export function composePlateRecognition(recognition: RecognitionService) {
  return new PlateRecognitionAdapter(new PlateRecognition<ExistingPlateRecognitionArguments, ExistingPlateRecognitionViews>(new ExistingPlateRecognition(recognition)));
}
