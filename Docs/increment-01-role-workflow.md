# Incremento 01 — Control por rol y preparación de estación

## Alcance

Specs rectoras: `Specs/00-system-overview.md`, `01-actors-and-roles.md`, `02-component-map.md`, `03-approved-decisions.md` y `04-supervisor-assistance.md` (sección Incremento 01). Una sola aplicación y login de Primax Control sirven a Supervisor, Admin y SuperAdmin. Se reutilizan User, SupervisorStationAssignment, AdminControlAccount, grants, turnos, terminales, asignaciones terminal–surtidor, auditoría, gateway firmado y sesiones técnicas existentes. No hay migración de esquema.

## Trazabilidad

| Contrato | Código | Prueba |
| --- | --- | --- |
| Login único; roles y alcance separados; multirrol | `Backend/src/control/control.service.ts`, `Backend/src/auth/access.guard.ts`, `Frontend_3_PrimaxControl/js/control-state.js` | `Backend/test/control.e2e-spec.ts`, `Frontend_3_PrimaxControl/tests/control-state.test.js` |
| Supervisor abre/cierra turno y consulta su estación | `Backend/src/operations/station-workflow.controller.ts`, `Backend/src/operations/operations.service.ts`, `Frontend_3_PrimaxControl/js/app.js` | `Backend/test/phase1a.e2e-spec.ts`, `Backend/src/operations/station-workflow.spec.ts` |
| «Iniciar estación» valida turno, asignación, terminal, surtidor y bloqueo; es idempotente | `Backend/src/operations/operations.service.ts`, `Frontend_3_PrimaxControl/js/app.js` | `Backend/src/operations/station-workflow.spec.ts`, `Backend/test/phase1a.e2e-spec.ts` |
| FuelFlow recibe preparación sin mostrar pairing, token ni credencial | `Backend/src/operations/station-workflow.controller.ts`, `Backend/src/kiosk/kiosk.service.ts`, `Frontend_1_FuelFlow/server/gateway.js`, `Frontend_1_FuelFlow/src/js/kioskSession.js` | `Backend/src/operations/station-workflow.spec.ts`, `Frontend_1_FuelFlow/tests/kiosk-gateway.test.js` |
| Supervisor no bloquea/restaura; Admin requiere grant y estación; SuperAdmin conserva alcance global | `Backend/src/operations/operations.controller.ts`, `Backend/src/control/control-operations.service.ts`, `Backend/src/auth/access.guard.ts` | `Backend/src/operations/station-workflow.spec.ts`, `Backend/test/phase1a.e2e-spec.ts`, `Backend/test/control-operations.e2e-spec.ts` |

## Pase seguro a FuelFlow

Control emite un ticket aleatorio de 90 segundos después de validar y preparar la estación. Redis guarda solo la clave derivada por SHA-256. El navegador lo lleva a FuelFlow en un fragmento de URL que se borra antes de la petición. El gateway de FuelFlow lo envía al Backend con firma HMAC y validación de origen. Backend lo consume atómicamente con `GETDEL`, vuelve a comprobar asignación, turno, estación y terminal, y emite o reutiliza la credencial técnica. El gateway instala las sesiones en cookies HttpOnly; la respuesta al navegador solo contiene estado y CSRF. Una repetición del ticket se rechaza. El Frontend no recibe JWT de Supervisor ni credencial técnica.

En Compose local, el origen público FuelFlow se pasa al build de Primax Control desde `FRONTEND1_PORT`. En otro despliegue se debe definir `FUELFLOW_PUBLIC_ORIGIN` con el origen HTTPS exacto durante el build de Control. Sin esa configuración, Control muestra un error seguro al intentar abrir FuelFlow y no solicita un ticket. Las credenciales y secretos del gateway siguen siendo configuración privada del Backend/gateway.

## Auditoría y pendientes

La apertura/cierre de turno y las acciones administrativas conservan sus eventos actuales. El inicio nuevo registra `STATION_PREPARED`; los fallos relevantes registran `STATION_PREPARATION_FAILED` sin tokens ni contraseñas. El pase técnico usa los eventos existentes de credencial. Las asignaciones de Supervisor conservan `grantedByUserId` y `reason`.

Las solicitudes de asistencia, su workflow, incidencias de pago V2, métodos de pago, impresión y numeración PRIME se implementarán en incrementos separados. La vista de Supervisor solo muestra operaciones técnicas en `INTERVENTION_REQUIRED` o terminales en `ASISTENCIA`; la bandeja de solicitudes aún no está activa.
