-- Fresh synthetic lab ONLY. Provisioned by harness, never startup migrations.
CREATE TABLE "IdentityServiceCredential" (
  "keyId" uuid PRIMARY KEY,
  "serviceId" text NOT NULL CHECK ("serviceId"='fuelflow-private'),
  "secretDigest" char(64) NOT NULL,
  "stationId" uuid NOT NULL,
  routes text[] NOT NULL,
  "notBefore" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  CHECK ("expiresAt">"notBefore")
);
