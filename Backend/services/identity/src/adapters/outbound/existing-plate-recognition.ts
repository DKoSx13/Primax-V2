import type { RecognitionService } from '../../../../../src/vehicles/recognition.service';
import type { PlateRecognitionPort } from '../../application/ports/plate-recognition';

export type ExistingPlateRecognitionArguments = {
  recognize: Parameters<RecognitionService['recognize']>;
};
export type ExistingPlateRecognitionViews = {
  recognize: Awaited<ReturnType<RecognitionService['recognize']>>;
};

export class ExistingPlateRecognition implements PlateRecognitionPort<ExistingPlateRecognitionArguments, ExistingPlateRecognitionViews> {
  constructor(private readonly recognition: RecognitionService) {}
  recognize(...args: ExistingPlateRecognitionArguments['recognize']) { return this.recognition.recognize(...args); }
}
