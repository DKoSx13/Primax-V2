# Incremento 02 — Solicitudes de asistencia

Spec rectora: `Specs/04-supervisor-assistance.md`, secciones 4–9. Rama: `feature/v2-02-assistance`, originada en `main` (`7cde52c`). No modifica referencias históricas V12.1.

## Diseño e implementación

`AssistanceRequest` separa la solicitud del ciclo de vida de `OperationalIncident`. Conserva estación, terminal, surtidor, operación técnica opcional, placa disponible, motivo, responsable, observación, resultado y timestamps. Los nombres de cliente se consultan desde la membresía vinculada a la operación, sin aceptar un ID de cliente arbitrario. Backend deriva estación/surtidor de la credencial técnica y la asignación real. Reintentos de creación reutilizan `requestId` y el cuerpo persistido en sessionStorage.

La aceptación ejecuta `updateMany WHERE status=PENDIENTE AND assignedSupervisorId IS NULL` dentro de una transacción serializable con retry. Asigna responsable/acceptedAt y escribe auditoría en la misma transacción. Un perdedor recibe HTTP 409 sin sobrescribir al ganador. Solo el responsable vigente puede registrar notas o finalizar; un Admin sin asignación de Supervisor consulta el historial pero no toma solicitudes. Cancelación del cliente permite pendiente/en atención, autenticada por la misma terminal; el responsable también puede registrar la cancelación solicitada por el cliente.

Control consulta cada 10 segundos la bandeja de su alcance; el módulo operativo incluye asistencia para Supervisores y una vista de historial requiere ADMIN_INCIDENT_VIEW para Admin/SuperAdmin. Se priorizan estados activos y se devuelven hasta 100 solicitudes por consulta. La vista de detalle conserva los eventos y la incidencia generada al escalar. No se notifica fuera de la estación. FuelFlow consulta estado cada 5 segundos mientras el diálogo esté abierto y nunca simula llegada ni resolución.

Las migraciones `20261030020000_v2_assistance` y `20261030020100_v2_assistance_invariants` son aditivas. La segunda añade claves compuestas de alcance y checks de evidencia de estado. Auditoría reutiliza `OperationalAuditEvent`, cuyo trigger existente rechaza UPDATE/DELETE. Ningún endpoint modifica pagos, grants o bloqueos de terminales.

## Trazabilidad SDD

| Requisito / Spec 04 | Componente y código | Tests | Validación |
| --- | --- | --- | --- |
| §4 motivos, contexto, OTRO, creación idempotente | `Backend/src/assistance/*`, `Frontend_1_FuelFlow/src/js/assistance.js` | `Backend/test/assistance.e2e-spec.ts`, `Frontend_1_FuelFlow/tests/assistance.test.js` | PostgreSQL local: creación/reintentos/validación HTTP |
| §4 aceptación atómica, responsable/acceptedAt, 409 | `assistance.service.ts:act` | E2E de dos Supervisores concurrentes | Un solo ganador y un evento ACCEPT |
| §4 resolver/escalar/cancelar/notas | `assistance.service.ts`, `Frontend_3_PrimaxControl/js/assistance.js` | E2E de estados finales, resultado obligatorio y cancelación concurrente | Timestamps, incidente vinculado y responsable preservados |
| §5/§7 alcance Admin, Supervisor y SuperAdmin | `assistance.service.ts:readScope`, AccessGuard existente | E2E de grants/estación/propietario y HTTP; `tests/assistance.test.js` de Control | Fuera de alcance rechazado; Admin no opera como Supervisor |
| §8 auditoría append-only | `OperationalAuditEvent`, transacciones de asistencia | E2E intenta UPDATE y DELETE de auditoría | Ambos rechazados por PostgreSQL |
| §9 FuelFlow solicita ayuda sin intervención normal | `src/index.html`, `src/js/script.js`, gateway estricto | tests de cliente y `kiosk-gateway.test.js` | Mantiene credencial técnica, origen y CSRF |

## Tests y builds

Ejecutados con contenedor PostgreSQL 17 exclusivo `primax-v2-local-test`, loopback 26602, base `primax_v2_test`; sin Neon ni V12.1. Los secretos locales solo están en archivos ignorados. Backend Jest: 23 suites / 189 pruebas; E2E nuevo: 8 pruebas reales de DB/HTTP. FuelFlow: 141 pruebas. Control: 18 pruebas. Builds Backend/FuelFlow/Control correctos. No se afirma validación física de impresora ni despliegue con este incremento.

## SDLC y pendientes

SDD dirige cada incremento: Spec → implementación → tests → validación, con evidencia por requisito. El SDLC global permanece Planificación → Análisis → Diseño → Construcción → Pruebas → Despliegue → Mantenimiento. Este PR cubre construcción y pruebas de asistencia; pagos, comprobantes, numeración, SonarQube y staging pertenecen a sus incrementos separados. Límite conocido: bandeja por polling, hasta 100 resultados; una cola mayor requiere paginación futura. No se han modificado las reglas financieras.
