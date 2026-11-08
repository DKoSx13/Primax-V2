BEGIN;
ALTER TABLE "Terminal" ALTER COLUMN "operationalStatus" SET DEFAULT 'DISPONIBLE';
-- Remove only idle historical administrative blocking. Never clear a genuine
-- intervention, revoked terminal, failed pump or ongoing operation.
INSERT INTO "OperationalAuditEvent" (id,"eventKey","actorKind","stationId","terminalId",action,"targetId",outcome,details,"createdAt")
SELECT gen_random_uuid(),'automatic-availability:'||t.id,'SYSTEM',t."stationId",t.id,
  'ADMINISTRATIVE_BLOCK_REMOVED',t.id::text,'SUCCESS',
  jsonb_build_object('previousStatus',t."operationalStatus",'previousReason',t."suspensionReason"),now()
FROM "Terminal" t WHERE t.lifecycle='REGISTRADA' AND t."operationalStatus"='BLOQUEADA'
AND NOT EXISTS(SELECT 1 FROM "TerminalOperation" o WHERE o."terminalId"=t.id AND o."closedAt" IS NULL);
UPDATE "Terminal" t SET "operationalStatus"='DISPONIBLE',"suspensionReason"=NULL,"statusVersion"="statusVersion"+1
WHERE t.lifecycle='REGISTRADA' AND t."operationalStatus"='BLOQUEADA'
AND NOT EXISTS(SELECT 1 FROM "TerminalOperation" o WHERE o."terminalId"=t.id AND o."closedAt" IS NULL);
COMMIT;
