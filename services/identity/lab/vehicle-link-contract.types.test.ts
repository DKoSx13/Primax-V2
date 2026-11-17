import type { LegacyVehicleLinkPort, LegacyVehicleOwnerReadPort, VehicleLinkCommandV1 } from "./vehicle-link-contract";
declare const queries: LegacyVehicleOwnerReadPort;
declare const commands: LegacyVehicleLinkPort;
// @ts-expect-error Read ports cannot invoke commands.
queries.linkForOwner({});
// @ts-expect-error Commands do not expose financial operations.
commands.recharge({});
// @ts-expect-error No supplied owner userId is accepted in a command.
const forged: VehicleLinkCommandV1 = { contractVersion: 1, operationId: "id", expectedMembershipId: "id", plate: "ABC-123", label: "Synthetic", userId: "foreign" };
void forged;
