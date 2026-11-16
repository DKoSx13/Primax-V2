-- A.4 PRIVATE synthetic database only. Never run on an existing database.
-- Intentionally separate from A.1/A.3, runtime schemas and production migrations.
CREATE SCHEMA identity_a4_private;
CREATE TABLE identity_a4_private."AccountReference" (
  "accountId" uuid PRIMARY KEY
);
CREATE TABLE identity_a4_private."MembershipIdentity" (
  "membershipId" uuid PRIMARY KEY,
  "accountId" uuid NOT NULL UNIQUE REFERENCES identity_a4_private."AccountReference"("accountId") ON DELETE RESTRICT,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE identity_a4_private."MembershipCode" (
  code varchar(30) COLLATE "C" PRIMARY KEY,
  "membershipId" uuid NOT NULL REFERENCES identity_a4_private."MembershipIdentity"("membershipId") ON DELETE RESTRICT,
  kind varchar(9) NOT NULL CHECK (kind IN ('CANONICAL','ALIAS')),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT a4_code_shape CHECK (char_length(code) BETWEEN 4 AND 30 AND code !~ '[^A-Z0-9-]'),
  CONSTRAINT a4_canonical_shape CHECK (kind <> 'CANONICAL' OR (code ~ '^PRIME-[A-Z]*[0-9]{3}$' AND right(code,3) <> '000')),
  UNIQUE (code,"membershipId",kind)
);
CREATE UNIQUE INDEX a4_one_canonical ON identity_a4_private."MembershipCode"("membershipId") WHERE kind='CANONICAL';
CREATE INDEX a4_codes_member ON identity_a4_private."MembershipCode"("membershipId");
CREATE TABLE identity_a4_private."MembershipNumberCounter" (
  id integer PRIMARY KEY CHECK (id=1),
  value bigint NOT NULL CHECK (value>=0)
);
CREATE TABLE identity_a4_private."AllocationReceipt" (
  "operationId" uuid PRIMARY KEY,
  "requestDigest" varchar(64) NOT NULL CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
  "contractVersion" integer NOT NULL CHECK ("contractVersion"=1),
  "policyVersion" varchar(40) NOT NULL CHECK ("policyVersion"='A4_UNIFIED_EXPLICIT_V1'),
  "membershipId" uuid NOT NULL UNIQUE REFERENCES identity_a4_private."MembershipIdentity"("membershipId") ON DELETE RESTRICT,
  "canonicalCode" varchar(30) COLLATE "C" NOT NULL,
  "codeKind" varchar(9) NOT NULL DEFAULT 'CANONICAL' CHECK ("codeKind"='CANONICAL'),
  "allocatedOrdinal" bigint NOT NULL UNIQUE CHECK ("allocatedOrdinal">0),
  "committedAt" timestamptz(3) NOT NULL DEFAULT now(),
  FOREIGN KEY ("canonicalCode","membershipId","codeKind") REFERENCES identity_a4_private."MembershipCode"(code,"membershipId",kind) ON DELETE RESTRICT
);

-- Independent SQL integrity check, not the allocator. Core remains the formatter.
CREATE FUNCTION identity_a4_private.format_ordinal(ordinal bigint) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE block bigint; prefix text := '';
BEGIN
  IF ordinal<1 THEN RAISE EXCEPTION 'A4_INVALID_ORDINAL' USING ERRCODE='23514'; END IF;
  block := (ordinal-1)/999;
  WHILE block>0 LOOP
    block := block-1;
    prefix := chr(65+(block%26)::integer)||prefix;
    block := block/26;
  END LOOP;
  RETURN 'PRIME-'||prefix||lpad((((ordinal-1)%999)+1)::text,3,'0');
END $$;
ALTER TABLE identity_a4_private."AllocationReceipt" ADD CONSTRAINT a4_receipt_format
CHECK ("canonicalCode"=identity_a4_private.format_ordinal("allocatedOrdinal"));

CREATE FUNCTION identity_a4_private.immutable_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'A4_IMMUTABLE_ROW' USING ERRCODE='23514'; END $$;
CREATE TRIGGER a4_anchor_immutable BEFORE UPDATE OR DELETE ON identity_a4_private."AccountReference" FOR EACH ROW EXECUTE FUNCTION identity_a4_private.immutable_row();
CREATE TRIGGER a4_member_immutable BEFORE UPDATE OR DELETE ON identity_a4_private."MembershipIdentity" FOR EACH ROW EXECUTE FUNCTION identity_a4_private.immutable_row();
CREATE TRIGGER a4_code_immutable BEFORE UPDATE OR DELETE ON identity_a4_private."MembershipCode" FOR EACH ROW EXECUTE FUNCTION identity_a4_private.immutable_row();
CREATE TRIGGER a4_receipt_immutable BEFORE UPDATE OR DELETE ON identity_a4_private."AllocationReceipt" FOR EACH ROW EXECUTE FUNCTION identity_a4_private.immutable_row();

-- Global scan is deliberately small-lab only; not a production scaling claim.
CREATE FUNCTION identity_a4_private.validate_state() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF (SELECT count(*) FROM identity_a4_private."MembershipNumberCounter")<>1 THEN
    RAISE EXCEPTION 'A4_COUNTER_MISSING' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM identity_a4_private."MembershipIdentity" m
    WHERE (SELECT count(*) FROM identity_a4_private."MembershipCode" c WHERE c."membershipId"=m."membershipId" AND c.kind='CANONICAL')<>1
       OR (SELECT count(*) FROM identity_a4_private."AllocationReceipt" r WHERE r."membershipId"=m."membershipId")<>1
  ) THEN RAISE EXCEPTION 'A4_INCOMPLETE_PROVISION' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM identity_a4_private."AllocationReceipt" r
    WHERE r."allocatedOrdinal">(SELECT value FROM identity_a4_private."MembershipNumberCounter" WHERE id=1)
  ) THEN RAISE EXCEPTION 'A4_COUNTER_BEHIND_RECEIPTS' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER a4_member_complete AFTER INSERT OR UPDATE OR DELETE ON identity_a4_private."MembershipIdentity" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity_a4_private.validate_state();
CREATE CONSTRAINT TRIGGER a4_code_complete AFTER INSERT OR UPDATE OR DELETE ON identity_a4_private."MembershipCode" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity_a4_private.validate_state();
CREATE CONSTRAINT TRIGGER a4_receipt_complete AFTER INSERT OR UPDATE OR DELETE ON identity_a4_private."AllocationReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity_a4_private.validate_state();
CREATE CONSTRAINT TRIGGER a4_counter_complete AFTER INSERT OR UPDATE OR DELETE ON identity_a4_private."MembershipNumberCounter" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity_a4_private.validate_state();
-- No seed here: fresh provision inserts (1,0); coherent restore inserts its snapshot.
