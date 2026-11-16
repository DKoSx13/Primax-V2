CREATE TABLE "IdentityServiceNonce" (
  "keyId" uuid NOT NULL,
  nonce uuid NOT NULL,
  "issuedAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("keyId",nonce)
);
-- No deletion/cleanup in this experiment. No key, JWT, body or token stored.
