-- A global PostgreSQL sequence numbers terminal operations, including cancelled ones.
-- Historical order uses the stored opening timestamp and UUID solely for deterministic backfill.
BEGIN;
CREATE SEQUENCE terminal_operation_op01_seq AS bigint NO CYCLE;

CREATE FUNCTION next_operation_number() RETURNS varchar(30) LANGUAGE plpgsql AS $$
DECLARE serial bigint;
BEGIN
  serial := nextval('terminal_operation_op01_seq');
  RETURN 'OP01-' || lpad(serial::text, greatest(4, length(serial::text)), '0');
END $$;

ALTER TABLE "TerminalOperation" ADD COLUMN "number" varchar(30);
DO $$
DECLARE old_operation record;
BEGIN
  FOR old_operation IN SELECT id FROM "TerminalOperation" ORDER BY "openedAt", id LOOP
    UPDATE "TerminalOperation" SET "number" = next_operation_number() WHERE id = old_operation.id;
  END LOOP;
END $$;
ALTER TABLE "TerminalOperation" ALTER COLUMN "number" SET DEFAULT next_operation_number();
ALTER TABLE "TerminalOperation" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_number_key" UNIQUE ("number");
ALTER TABLE "TerminalOperation" ADD CONSTRAINT "TerminalOperation_number_format" CHECK ("number" ~ '^OP01-[0-9]{4,}$');

CREATE FUNCTION protect_terminal_operation_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."number" IS DISTINCT FROM OLD."number" THEN
    RAISE EXCEPTION 'Operation number cannot change' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER terminal_operation_number_immutable BEFORE UPDATE OF "number" ON "TerminalOperation"
  FOR EACH ROW EXECUTE FUNCTION protect_terminal_operation_number();
COMMIT;
