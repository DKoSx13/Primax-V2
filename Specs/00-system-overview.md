# 00 — Visión del sistema Primax V2

Estado: **base documental aprobada**. Baseline: Primax V12.1 con hotfix de Primax Control. El Incremento 01 implementa acceso por rol y preparación de estación; las demás decisiones V2 siguen pendientes.

Primax conecta autoservicio en el surtidor (FuelFlow), portal del cliente (Primax Prime), administración y operación de estación (Primax Control), API y reglas de negocio (Backend), PostgreSQL, reconocimiento de placas y agente de impresión.

`Frontend_3_PrimaxControl` es una sola aplicación con un solo login. La interfaz disponible depende de la cuenta autenticada, rol, grants/permisos, estaciones asignadas y alcance global o por estación. La API/Backend es autoridad para autenticación, autorización, alcance y reglas de negocio; ocultar controles en UI no autoriza ni protege una operación.

Principio de responsabilidades: **Supervisor opera y asiste. Admin administra. SuperAdmin gobierna.** FuelFlow es autoservicio prácticamente completo: el cliente normalmente completa su operación sin Supervisor; la asistencia es excepcional y queda registrada. Las solicitudes de asistencia y las incidencias son conceptos distintos.

Para el contrato funcional V2, los pagos permitidos son Yape, Plin, tarjeta y Saldo Prime; efectivo queda fuera. La impresión física se realiza exclusivamente mediante PrintAgent local. La membresía usa un código público `PRIME-...` separado de su ID interno estable.

La especificación V2 describe evolución futura. El comportamiento ejecutable copiado sigue siendo el de V12.1, incluido el hotfix; cuando haya diferencias, las decisiones en `03-approved-decisions.md` y las Specs V2 específicas definen el contrato futuro, no el comportamiento actual.
