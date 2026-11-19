import type { PlateRecognitionPort } from '../../application/ports/plate-recognition';
import type { ExistingPlateRecognitionArguments, ExistingPlateRecognitionViews } from '../outbound/existing-plate-recognition';

export class PlateRecognitionAdapter {
  constructor(private readonly engine: PlateRecognitionPort<ExistingPlateRecognitionArguments, ExistingPlateRecognitionViews>) {}
  recognize(...args: ExistingPlateRecognitionArguments['recognize']) { return this.engine.recognize(...args); }
}
