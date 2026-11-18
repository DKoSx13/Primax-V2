-- NEW SYNTHETIC Backend-authority database only. No operational migration.
CREATE SCHEMA vehicle_link_private;
REVOKE ALL ON SCHEMA vehicle_link_private FROM PUBLIC;
CREATE TABLE vehicle_link_private."SuccessReceipt" (
  "callerNamespace" varchar(60) COLLATE "C" NOT NULL CHECK ("callerNamespace" ~ '^[a-z0-9-]{4,60}$'),
  "operationId" uuid NOT NULL,
  "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
  "membershipId" uuid NOT NULL REFERENCES public."Membership"(id) ON DELETE RESTRICT,
  "vehicleId" uuid NOT NULL REFERENCES public."Vehicle"(id) ON DELETE RESTRICT,
  "requestDigest" varchar(64) NOT NULL CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
  "contractVersion" integer NOT NULL CHECK ("contractVersion"=2),
  "policyVersion" varchar(30) NOT NULL CHECK ("policyVersion"='SUCCESS_ONLY_V1'),
  plate varchar(7) NOT NULL CHECK (plate ~ '^[A-Z0-9]{3}-[0-9]{3}$'),
  label varchar(80) NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  "recordedAt" timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY ("callerNamespace","operationId")
);
CREATE FUNCTION vehicle_link_private.reject_receipt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_SUCCESS_RECEIPT' USING ERRCODE='55000'; END $$;
CREATE TRIGGER immutable_vehicle_receipt BEFORE UPDATE OR DELETE ON vehicle_link_private."SuccessReceipt"
FOR EACH ROW EXECUTE FUNCTION vehicle_link_private.reject_receipt_mutation();
GRANT USAGE ON SCHEMA vehicle_link_private TO a4_vehicle_writer,a4_legacy_reader;
GRANT SELECT,INSERT ON vehicle_link_private."SuccessReceipt" TO a4_vehicle_writer;
GRANT SELECT ON vehicle_link_private."SuccessReceipt" TO a4_legacy_reader;
