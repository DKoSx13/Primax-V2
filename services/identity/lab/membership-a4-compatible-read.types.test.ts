import type { LegacyCompatibleReadProvider, MembershipSelector, VehiclePage } from "./membership-a4-compatible-read";
declare const provider: LegacyCompatibleReadProvider;
// @ts-expect-error A read provider cannot provision a membership.
provider.provision({});
// @ts-expect-error Normalization remains an explicit, closed policy.
const selector: MembershipSelector = { kind: "code", code: "PRIM001", normalization: "guess" };
// @ts-expect-error Pagination remains numeric.
const page: VehiclePage = { page: "1", limit: 20 };
void selector; void page;
