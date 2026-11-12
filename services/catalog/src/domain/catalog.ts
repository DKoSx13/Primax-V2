export interface Station {
  id: string; code: string; name: string; address: string; active: boolean;
  createdAt: Date; updatedAt: Date;
}
export interface Fuel {
  id: string; code: string; name: string; pricePerGallon: string; active: boolean;
  createdAt: Date; updatedAt: Date;
}
export interface Benefit {
  id: string; code: string; title: string; description: string; category: string;
  pointsCost: number; active: boolean; createdAt: Date; updatedAt: Date;
}
// Inventory is a read projection. Commerce retains every inventory mutation.
export interface Inventory {
  stationId: string; fuelId: string; liters: string; reservedLiters: string;
  updatedAt: Date; fuel: Fuel; station: Station;
}
