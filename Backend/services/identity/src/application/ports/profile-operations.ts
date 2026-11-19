/** Original transport/actor tuples are supplied at composition; no policy here. */
export interface ProfileOperationsArguments { updateProfile: unknown[] }
export interface ProfileOperationsViews { updateProfile: unknown }
export interface ProfileOperationsPort<I extends ProfileOperationsArguments, V extends ProfileOperationsViews> {
  updateProfile(...args: I['updateProfile']): Promise<V['updateProfile']>;
}
