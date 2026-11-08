BEGIN;
-- Existing transactions have a type/identity snapshot, but no document number.
-- Preserve them and backfill one explicitly marked legacy document per sale.
CREATE SEQUENCE receipt_boleta_seq AS bigint NO CYCLE;
CREATE SEQUENCE receipt_factura_seq AS bigint NO CYCLE;

CREATE TABLE "Receipt" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "transactionId" uuid NOT NULL UNIQUE REFERENCES "Transaction"(id) ON DELETE RESTRICT,
  "documentType" "ReceiptType" NOT NULL,
  series varchar(4) NOT NULL,
  correlative bigint NOT NULL CHECK (correlative > 0),
  number varchar(30) NOT NULL UNIQUE,
  "issuedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy boolean NOT NULL DEFAULT false,
  UNIQUE(series, correlative),
  CONSTRAINT receipt_series_type CHECK (
    ("documentType"='BOLETA' AND series='EB01') OR
    ("documentType"='FACTURA' AND series='FT01')),
  CONSTRAINT receipt_number_format CHECK (
    number = series || '-' || lpad(correlative::text, greatest(4,length(correlative::text)), '0'))
);

DO $$
DECLARE sale record; serial bigint; prefix text;
BEGIN
  FOR sale IN SELECT id,"receiptType" FROM "Transaction" ORDER BY "createdAt",id LOOP
    prefix := CASE WHEN sale."receiptType"='BOLETA' THEN 'EB01' ELSE 'FT01' END;
    serial := CASE WHEN sale."receiptType"='BOLETA' THEN nextval('receipt_boleta_seq') ELSE nextval('receipt_factura_seq') END;
    INSERT INTO "Receipt" ("transactionId","documentType",series,correlative,number,legacy)
      VALUES(sale.id,sale."receiptType",prefix,serial,prefix||'-'||lpad(serial::text,greatest(4,length(serial::text)),'0'),true);
  END LOOP;
END $$;

-- Issuance is part of committing the sale, including every existing write path.
-- PostgreSQL sequences are atomic and do not reuse values after rollback.
CREATE FUNCTION issue_transaction_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE serial bigint; prefix text; sequence_name text;
BEGIN
  prefix := CASE WHEN NEW."receiptType"='BOLETA' THEN 'EB01' ELSE 'FT01' END;
  sequence_name := CASE WHEN NEW."receiptType"='BOLETA' THEN 'receipt_boleta_seq' ELSE 'receipt_factura_seq' END;
  serial := nextval(format('%I.%I',TG_TABLE_SCHEMA,sequence_name)::regclass);
  EXECUTE format('INSERT INTO %I."Receipt" ("transactionId","documentType",series,correlative,number) VALUES ($1,$2,$3,$4,$5)',TG_TABLE_SCHEMA)
    USING NEW.id,NEW."receiptType",prefix,serial,prefix||'-'||lpad(serial::text,greatest(4,length(serial::text)),'0');
  RETURN NEW;
END $$;
CREATE TRIGGER transaction_receipt_issued AFTER INSERT ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION issue_transaction_receipt();

CREATE FUNCTION protect_issued_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Issued receipts are immutable; preserve their number and transaction link' USING ERRCODE='23514';
END $$;
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON "Receipt"
  FOR EACH ROW EXECUTE FUNCTION protect_issued_receipt();

CREATE FUNCTION protect_receipt_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."receiptType" IS DISTINCT FROM OLD."receiptType" THEN
    RAISE EXCEPTION 'An issued document cannot change its type' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transaction_receipt_type_immutable BEFORE UPDATE OF "receiptType" ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION protect_receipt_type();
COMMIT;
