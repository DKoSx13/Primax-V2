-- Fresh synthetic database ONLY. No startup migrations; no real-table changes.
-- Schema is created separately by the fresh-lab harness.
CREATE TABLE fuelflow_lab."CallerOperation" (
  "userId" uuid NOT NULL,
  "callerOperationId" uuid NOT NULL,
  "authVersion" integer NOT NULL,
  action text NOT NULL CHECK (action = 'TERMINAL_CREDENTIAL_ISSUE'),
  "stationId" uuid NOT NULL,
  "terminalId" uuid NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  fingerprint char(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "callerOperationId"),
  CHECK ("expiresAt" > "createdAt")
);
-- Caller gets INSERT/SELECT only. No cross-domain FK, token or response storage.
