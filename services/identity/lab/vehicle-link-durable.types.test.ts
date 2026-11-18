import type { DurableVehicleResultPort, DurableVehicleCommandPort, DurableLinkCommand } from "./vehicle-link-durable-contract";
declare const reader: DurableVehicleResultPort;
declare const writer: DurableVehicleCommandPort;
// @ts-expect-error A receipt query cannot submit a command.
reader.submit({});
// @ts-expect-error The command port cannot perform financial operations.
writer.recharge({});
// @ts-expect-error V1 correlation is not the durable profile.
const legacy: DurableLinkCommand = { contractVersion: 1, operationId: "id", expectedMembershipId: "id", plate: "ABC-123", label: "Synthetic" };
void legacy;
