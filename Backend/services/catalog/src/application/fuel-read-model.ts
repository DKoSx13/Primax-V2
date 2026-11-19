/** Existing read representation, before or after the legacy HTTP boundary.
 * Values pass through unchanged; this is not a price calculation or mapper.
 */
export interface FuelReadModel {
  id: string;
  code: string;
  name: string;
  pricePerGallon: string | { toJSON(): string };
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}
