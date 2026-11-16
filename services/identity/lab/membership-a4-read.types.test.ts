// Compile-only contract checks, no connection, executable fixture or configuration.
import type { MembershipIdentityRead, MembershipIdentityView, TrustedMember } from "./membership-a4-read";
declare const reader: MembershipIdentityRead;
declare const actor: TrustedMember;
declare const view: MembershipIdentityView;
reader.forUser(actor);
reader.resolveCode(actor, "PRIM001", "exact");
// @ts-expect-error UUID selectors must be strings.
reader.byMembershipId(actor, 123);
// @ts-expect-error No implicit normalization policy.
reader.resolveCode(actor, "PRIM001");
// @ts-expect-error Read ports do not expose provisioning.
reader.provision({});
// @ts-expect-error No financial fields in identity reads.
view.balance;
// @ts-expect-error Identifiers are immutable.
view.membershipId = "other";
