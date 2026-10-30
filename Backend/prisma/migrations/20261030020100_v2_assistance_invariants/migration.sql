-- Preserve real terminal/station/pump/operation bindings in addition to API checks.
ALTER TABLE "AssistanceRequest"
  ADD CONSTRAINT assistance_terminal_scope FOREIGN KEY ("terminalId", "stationId") REFERENCES "Terminal"("id", "stationId") ON DELETE RESTRICT,
  ADD CONSTRAINT assistance_pump_scope FOREIGN KEY ("pumpId", "stationId") REFERENCES "Pump"("id", "stationId") ON DELETE RESTRICT,
  ADD CONSTRAINT assistance_operation_scope FOREIGN KEY ("terminalOperationId", "terminalId", "pumpId", "stationId") REFERENCES "TerminalOperation"("id", "terminalId", "pumpId", "stationId") ON DELETE RESTRICT,
  ADD CONSTRAINT assistance_assignment CHECK (("assignedSupervisorId" IS NULL) = ("acceptedAt" IS NULL)),
  ADD CONSTRAINT assistance_state_evidence CHECK (
    ("status" = 'PENDIENTE' AND "assignedSupervisorId" IS NULL AND "resolvedAt" IS NULL AND "escalatedAt" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'EN_ATENCION' AND "assignedSupervisorId" IS NOT NULL AND "resolvedAt" IS NULL AND "escalatedAt" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'RESUELTA' AND "assignedSupervisorId" IS NOT NULL AND "resolvedAt" IS NOT NULL AND "escalatedAt" IS NULL AND "cancelledAt" IS NULL AND length(trim("result")) > 0)
    OR ("status" = 'ESCALADA' AND "assignedSupervisorId" IS NOT NULL AND "escalatedAt" IS NOT NULL AND "resolvedAt" IS NULL AND "cancelledAt" IS NULL AND length(trim("result")) > 0)
    OR ("status" = 'CANCELADA_POR_CLIENTE' AND "cancelledAt" IS NOT NULL AND "resolvedAt" IS NULL AND "escalatedAt" IS NULL)
  );
