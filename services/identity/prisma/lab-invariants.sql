-- Supplemental invariants for a NEW synthetic 14-model database only.
-- Equivalent Identity checks/indexes from legacy migrations; not a migration plan.
ALTER TABLE "User" ADD CONSTRAINT user_email_canonical CHECK (email = lower(email));
ALTER TABLE "Vehicle" ADD CONSTRAINT vehicle_plate_format CHECK (plate ~ '^[A-Z0-9]{3}-[0-9]{3}$');
ALTER TABLE "MembershipNumberCounter" ADD CONSTRAINT identity_counter_id CHECK (id = 1);
ALTER TABLE "MembershipNumberCounter" ADD CONSTRAINT identity_counter_value CHECK (value >= 0);
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_one_identity" CHECK (dni IS NULL OR passport IS NULL);
ALTER TABLE "Membership" ADD CONSTRAINT membership_documents_v9 CHECK
  ((dni IS NULL OR dni ~ '^[0-9]{8}$') AND (ruc IS NULL OR ruc ~ '^[0-9]{11}$'));
ALTER TABLE "Membership" ADD CONSTRAINT membership_balance_nonnegative_v9 CHECK (balance >= 0);
CREATE UNIQUE INDEX "UserPermissionGrant_one_active" ON "UserPermissionGrant" ("userId", permission) WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "TerminalCredential_one_active" ON "TerminalCredential" ("terminalId") WHERE "revokedAt" IS NULL;
ALTER TABLE "UserPermissionGrant" ADD CONSTRAINT "UserPermissionGrant_dates" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "grantedAt");
ALTER TABLE "TerminalCredential" ADD CONSTRAINT "TerminalCredential_dates" CHECK
  ("expiresAt" > "issuedAt" AND ("revokedAt" IS NULL OR "revokedAt" >= "issuedAt"));
ALTER TABLE "Terminal" ADD CONSTRAINT "Terminal_lifecycle_dates" CHECK
  ((lifecycle = 'REVOCADA') = ("revokedAt" IS NOT NULL) AND "statusVersion" >= 0);
