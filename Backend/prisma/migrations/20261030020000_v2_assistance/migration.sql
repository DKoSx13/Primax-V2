-- CreateEnum
CREATE TYPE "AssistanceReason" AS ENUM ('AYUDA_GENERAL', 'ERROR_PAGO', 'PROBLEMA_TERMINAL', 'PROBLEMA_DESPACHO', 'COMPROBANTE_IMPRESION', 'OTRO');

-- CreateEnum
CREATE TYPE "AssistanceStatus" AS ENUM ('PENDIENTE', 'EN_ATENCION', 'RESUELTA', 'ESCALADA', 'CANCELADA_POR_CLIENTE');

-- CreateTable
CREATE TABLE "AssistanceRequest" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "terminalId" UUID NOT NULL,
    "pumpId" UUID NOT NULL,
    "operationId" UUID,
    "terminalOperationId" UUID,
    "plate" VARCHAR(7),
    "reason" "AssistanceReason" NOT NULL,
    "status" "AssistanceStatus" NOT NULL DEFAULT 'PENDIENTE',
    "assignedSupervisorId" UUID,
    "observation" VARCHAR(500),
    "result" VARCHAR(500),
    "acceptedAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "escalatedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssistanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistanceRequest_requestId_key" ON "AssistanceRequest"("requestId");

-- CreateIndex
CREATE INDEX "AssistanceRequest_stationId_status_createdAt_idx" ON "AssistanceRequest"("stationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AssistanceRequest_terminalId_createdAt_idx" ON "AssistanceRequest"("terminalId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_terminalOperationId_fkey" FOREIGN KEY ("terminalOperationId") REFERENCES "TerminalOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_assignedSupervisorId_fkey" FOREIGN KEY ("assignedSupervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

