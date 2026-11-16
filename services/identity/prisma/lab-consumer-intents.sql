-- Fresh synthetic laboratory ONLY. No startup migration or real data movement.
-- No bearer/CSRF/previous credential/response tokens are stored here.
CREATE TABLE "IdentityConsumerIntent" (
  "intentId" uuid PRIMARY KEY,
  "commandId" uuid NOT NULL UNIQUE,
  "callerOperationId" uuid,
  permissions text[],
  UNIQUE ("userId", "callerOperationId"),
  CHECK (("callerOperationId" IS NULL AND permissions IS NULL) OR
         ("callerOperationId" IS NOT NULL AND permissions IS NOT NULL)),
  "userId" uuid NOT NULL,
  "authVersion" integer NOT NULL,
  "stationId" uuid NOT NULL,
  "terminalId" uuid NOT NULL,
  action text NOT NULL CHECK (action = 'TERMINAL_CREDENTIAL_ISSUE'),
  fingerprint char(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  CHECK ("expiresAt" > "createdAt")
);
-- Immutable to the consumer role; expired handles remain tombstones.
