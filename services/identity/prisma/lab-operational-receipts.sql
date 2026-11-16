-- Laboratory ONLY: installed explicitly on the fresh synthetic database by the runner.
-- Never added to existing migration history or automatically applied at startup.
CREATE TABLE "IdentityOperationalReceipt" (
  "callerId" text NOT NULL,
  "commandId" uuid NOT NULL,
  fingerprint char(64) NOT NULL,
  "terminalId" uuid NOT NULL REFERENCES "Terminal"(id) ON DELETE RESTRICT,
  "credentialId" uuid NOT NULL REFERENCES "TerminalCredential"(id) ON DELETE RESTRICT,
  "keyId" text NOT NULL,
  nonce text NOT NULL,
  ciphertext text NOT NULL,
  tag text NOT NULL,
  "committedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("callerId", "commandId")
);
-- No expiration/deletion/reuse of command IDs: retention/tombstone policy remains pending.
