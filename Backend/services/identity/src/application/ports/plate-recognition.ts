/** Original transport/actor tuples are supplied at composition; no policy here. */
export interface PlateRecognitionArguments { recognize: unknown[] }
export interface PlateRecognitionViews { recognize: unknown }
export interface PlateRecognitionPort<I extends PlateRecognitionArguments, V extends PlateRecognitionViews> {
  recognize(...args: I['recognize']): Promise<V['recognize']>;
}
