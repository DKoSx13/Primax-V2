# Auditoría estática de relaciones de Identity

Fuente: services/identity/prisma/compatibility.prisma.
SHA-256: `40f9053c66724e3c07d723da84f7a7bf14999d38d73806c750bc4a9d826ee35e`.

Se identifican **37 relaciones declaradas** que cruzan el conjunto de los 14 modelos proyectados.
Ese conjunto incluye referencias de Station/Terminal y datos compartidos; no equivale a propiedad exclusiva de Identity.
La lista no sustituye inspección de constraints SQL adicionales ni enumera referencias escalares sin FK.

| Tabla origen | Columnas | Tabla referenciada | Referencias |
| --- | --- | --- | --- |
| Transaction | vehicleId | Vehicle | id |
| Transaction | membershipId | Membership | id |
| Transaction | stationId | Station | id |
| Transaction | terminalId | Terminal | id |
| FuelAuthorization | membershipId | Membership | id |
| FuelAuthorization | vehicleId | Vehicle | id |
| FuelAuthorization | stationId | Station | id |
| FuelAuthorization | terminalId | Terminal | id |
| SupervisorStationAssignment | userId | User | id |
| SupervisorStationAssignment | stationId | Station | id |
| SupervisorStationAssignment | grantedByUserId | User | id |
| Pump | stationId | Station | id |
| TerminalPumpAssignment | stationId | Station | id |
| TerminalPumpAssignment | terminalId | Terminal | id |
| TerminalPumpAssignment | assignedByUserId | User | id |
| SupervisorShift | supervisorUserId | User | id |
| SupervisorShift | stationId | Station | id |
| TerminalEnablement | stationId | Station | id |
| TerminalEnablement | terminalId | Terminal | id |
| TerminalEnablement | enabledByUserId | User | id |
| TerminalOperation | stationId | Station | id |
| TerminalOperation | terminalId | Terminal | id |
| OperationalAuditEvent | actorUserId | User | id |
| OperationalAuditEvent | stationId | Station | id |
| OperationalAuditEvent | terminalId | Terminal | id |
| OperationalIncident | stationId | Station | id |
| OperationalIncident | terminalId | Terminal | id |
| OperationalIncident | resolvedByUserId | User | id |
| WalletMovement | membershipId | Membership | id |
| RewardMovement | membershipId | Membership | id |
| Redemption | membershipId | Membership | id |
| MembershipDebt | membershipId | Membership | id |
| BusinessAlert | membershipId | Membership | id |
| FuelInventory | stationId | Station | id |
| AssistanceRequest | stationId | Station | id |
| AssistanceRequest | terminalId | Terminal | id |
| AssistanceRequest | assignedStaffId | User | id |

Ninguna relación existente fue eliminada o convertida en una llamada remota.
La base nueva del experimento no contiene las tablas externas: no es una migración de la base compartida.
Referencias escalares relevantes adicionales: welcomeReservedOperationId, welcomeTransactionId, rotatedFromId,
userId de orden/compra, operationId y actor/targetId de auditoría requieren contrato aunque no aparezcan como FK.
