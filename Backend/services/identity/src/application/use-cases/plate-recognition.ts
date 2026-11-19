import type { PlateRecognitionPort, PlateRecognitionArguments, PlateRecognitionViews } from '../ports/plate-recognition';

export class PlateRecognition<I extends PlateRecognitionArguments, V extends PlateRecognitionViews> implements PlateRecognitionPort<I, V> {
  constructor(private readonly engine: PlateRecognitionPort<I, V>) {}
  recognize(...args: I['recognize']) { return this.engine.recognize(...args); }
}
