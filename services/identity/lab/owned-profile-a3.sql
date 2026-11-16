-- Explicit fresh-lab installation only; not part of startup or existing migrations.
CREATE SCHEMA identity_private;
CREATE TABLE identity_private."Account" (
  id uuid PRIMARY KEY,
  email varchar(254) NOT NULL UNIQUE,
  name varchar(80) NOT NULL,
  "passwordHash" varchar(100) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  "authVersion" integer NOT NULL DEFAULT 0 CHECK ("authVersion">=0),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL
);
CREATE TABLE identity_private."IdentityProfile" (
  "accountId" uuid PRIMARY KEY REFERENCES identity_private."Account"(id) ON DELETE RESTRICT,
  dni varchar(8) UNIQUE CHECK (dni IS NULL OR dni ~ '^[0-9]{8}$'),
  passport varchar(20) UNIQUE CHECK (passport IS NULL OR passport ~ '^[A-Z0-9]{5,20}$'),
  ruc varchar(11) UNIQUE CHECK (ruc IS NULL OR ruc ~ '^[0-9]{11}$'),
  "businessName" varchar(160) CHECK ("businessName" IS NULL OR char_length("businessName") >= 1),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL,
  CHECK (dni IS NULL OR passport IS NULL)
);
-- The only FK is within Identity. No membership, status, balance, welcome,
-- Station, Terminal, credential operation or administrative tables exist here.
