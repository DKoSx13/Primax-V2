BEGIN;
-- Compatibility for the old dashboard switch, including a selection screen
-- abandoned while administratively suspended. Never cancel a financial sale.
LOCK TABLE "Terminal", "TerminalOperation" IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE legacy_admin_release ON COMMIT DROP AS
SELECT t.id,t."stationId",t."operationalStatus",t."suspensionReason"
FROM "Terminal" t
WHERE t.lifecycle='REGISTRADA' AND t."operationalStatus" IN ('BLOQUEADA','ASISTENCIA')
AND EXISTS(SELECT 1 FROM "OperationalAuditEvent" a WHERE a."terminalId"=t.id
  AND a.action='TERMINAL_SUSPENDED' AND a."actorUserId"=t."statusChangedByUserId"
  AND a.details->>'status'=t."operationalStatus"::text
  AND a.details->>'reason'=t."suspensionReason")
AND EXISTS(SELECT 1 FROM "TerminalPumpAssignment" a JOIN "Pump" p ON p.id=a."pumpId"
  WHERE a."terminalId"=t.id AND a."endedAt" IS NULL AND p.active)
AND NOT EXISTS(SELECT 1 FROM "OperationalIncident" i WHERE i."terminalId"=t.id AND i.status IN ('OPEN','IN_REVIEW'))
AND NOT EXISTS(SELECT 1 FROM "TerminalOperation" o WHERE o."terminalId"=t.id AND o."closedAt" IS NULL AND (
  o.status<>'ACTIVE'
  OR EXISTS(SELECT 1 FROM "FuelAuthorization" f WHERE f."operationId"=o."operationId")
  OR EXISTS(SELECT 1 FROM "Transaction" s WHERE s."operationId"=o."operationId")
  OR EXISTS(SELECT 1 FROM "Payment" p WHERE p."operationId"=o."operationId")
  OR EXISTS(SELECT 1 FROM "OnlineOrder" p WHERE p."operationId"=o."operationId")
  OR EXISTS(SELECT 1 FROM "InventoryReservation" r WHERE r."operationId"=o."operationId")
));

WITH closed AS (
  UPDATE "TerminalOperation" o SET status='CLOSED',"closedAt"=now(),version=version+1
  WHERE o."terminalId" IN(SELECT id FROM legacy_admin_release) AND o."closedAt" IS NULL
  RETURNING o.id,o."terminalId",o."stationId",o."operationId"
)
INSERT INTO "OperationalAuditEvent"(id,"eventKey","actorKind","terminalId","stationId",action,"targetId",outcome,details,"createdAt")
SELECT gen_random_uuid(),'empty-attention-release:'||id,'SYSTEM',"terminalId","stationId",
  'EMPTY_ATTENTION_CLOSED',id::text,'SUCCESS',jsonb_build_object('operationId',"operationId",'reason','Legacy administrative suspension; no payment, authorization, stock reservation or sale exists'),now()
FROM closed;

INSERT INTO "OperationalAuditEvent"(id,"eventKey","actorKind","terminalId","stationId",action,"targetId",outcome,details,"createdAt")
SELECT gen_random_uuid(),'legacy-admin-release:'||id,'SYSTEM',id,"stationId",'ADMINISTRATIVE_BLOCK_REMOVED',id::text,
  'SUCCESS',jsonb_build_object('previousStatus',"operationalStatus",'previousReason',"suspensionReason"),now()
FROM legacy_admin_release;
UPDATE "Terminal" SET "operationalStatus"='DISPONIBLE',"suspensionReason"=NULL,"statusVersion"="statusVersion"+1
WHERE id IN(SELECT id FROM legacy_admin_release);
COMMIT;
