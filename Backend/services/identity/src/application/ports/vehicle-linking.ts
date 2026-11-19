/** Original transport/actor tuples are supplied at composition; no policy here. */
export interface VehicleLinkingArguments { create: unknown[] }
export interface VehicleLinkingViews { create: unknown }
export interface VehicleLinkingPort<I extends VehicleLinkingArguments, V extends VehicleLinkingViews> {
  create(...args: I['create']): Promise<V['create']>;
}
