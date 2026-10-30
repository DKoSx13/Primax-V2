BEGIN;
LOCK TABLE "Membership", "MembershipNumberCounter" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "MembershipCodeAlias" (
  "code" VARCHAR(30) PRIMARY KEY,
  "membershipId" UUID NOT NULL REFERENCES "Membership"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MembershipCodeAlias_membershipId_idx" ON "MembershipCodeAlias"("membershipId");

CREATE FUNCTION v2_prime_format(ordinal BIGINT) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE block BIGINT; prefix TEXT := ''; result TEXT;
BEGIN
  IF ordinal < 1 THEN RAISE EXCEPTION 'Invalid membership ordinal'; END IF;
  block := (ordinal - 1) / 999;
  WHILE block > 0 LOOP
    block := block - 1;
    prefix := chr(65 + (block % 26)::INT) || prefix;
    block := block / 26;
  END LOOP;
  result := 'PRIME-' || prefix || lpad((((ordinal - 1) % 999) + 1)::TEXT, 3, '0');
  RETURN result;
END $$;

-- Decode only canonical V2 codes. This reconciles the counter high-water mark;
-- allocation itself always uses UPDATE counter RETURNING, never SELECT MAX + 1.
CREATE FUNCTION v2_prime_ordinal(code TEXT) RETURNS BIGINT LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE prefix TEXT; block NUMERIC := 0; n INT; ordinal NUMERIC;
BEGIN
  IF code !~ '^PRIME-[A-Z]*[0-9]{3}$' OR right(code,3) = '000' THEN RETURN NULL; END IF;
  prefix := substring(code FROM 7 FOR length(code)-9);
  FOR n IN 1..length(prefix) LOOP block := block * 26 + ascii(substring(prefix FROM n FOR 1)) - 64; END LOOP;
  ordinal := block * 999 + right(code,3)::INT;
  IF ordinal > 9223372036854775806 THEN RAISE EXCEPTION 'Membership ordinal exceeds PostgreSQL counter capacity'; END IF;
  RETURN ordinal::BIGINT;
END $$;

-- Reserve all canonical and transformable legacy ordinals before allocating
-- unknown formats, so a collision cannot overwrite another member's public code.
UPDATE "MembershipNumberCounter" SET "value" = GREATEST("value", COALESCE((
  SELECT max(v2_prime_ordinal(CASE
    WHEN "number" ~ '^PRIM-[0-9]{3}[A-Z]*$' AND substring("number" FROM 6 FOR 3) <> '000'
      THEN 'PRIME-' || substring("number" FROM 9) || substring("number" FROM 6 FOR 3)
    ELSE "number" END)) FROM "Membership"
),0)) WHERE "id"=1;

DO $$
DECLARE member RECORD; candidate TEXT; ordinal BIGINT;
BEGIN
  FOR member IN SELECT "id","number" FROM "Membership" ORDER BY "createdAt","id" LOOP
    IF v2_prime_ordinal(member."number") IS NOT NULL THEN CONTINUE; END IF;
    candidate := NULL;
    IF member."number" ~ '^PRIM-[0-9]{3}[A-Z]*$' AND substring(member."number" FROM 6 FOR 3) <> '000' THEN
      candidate := 'PRIME-' || substring(member."number" FROM 9) || substring(member."number" FROM 6 FOR 3);
    END IF;
    WHILE candidate IS NULL OR EXISTS (SELECT 1 FROM "Membership" WHERE "number"=candidate AND "id"<>member."id") LOOP
      UPDATE "MembershipNumberCounter" SET "value"="value"+1 WHERE "id"=1 RETURNING "value" INTO ordinal;
      IF ordinal IS NULL THEN RAISE EXCEPTION 'Membership counter missing'; END IF;
      candidate := v2_prime_format(ordinal);
    END LOOP;
    INSERT INTO "MembershipCodeAlias"("code","membershipId") VALUES (member."number",member."id");
    UPDATE "Membership" SET "number"=candidate WHERE "id"=member."id";
  END LOOP;
END $$;

DROP FUNCTION v2_prime_ordinal(TEXT);
DROP FUNCTION v2_prime_format(BIGINT);
COMMIT;
