-- An assigned pump cannot serve two active operations, even if an assignment changes.
CREATE UNIQUE INDEX "TerminalOperation_one_active_pump"
  ON "TerminalOperation"("pumpId") WHERE "closedAt" IS NULL;
