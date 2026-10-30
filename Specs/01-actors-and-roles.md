# 01 — Actores y roles

## Principio de responsabilidades

**Supervisor opera y asiste. Admin administra. SuperAdmin gobierna.** Los roles permanecen separados, aunque una misma cuenta puede acumular más de un rol o grant cuando sea necesario. La asignación de roles, grants y alcance requiere autorización del Backend en cada operación protegida.

| Actor | Alcance y responsabilidad conceptual |
| --- | --- |
| Cliente | Usa FuelFlow para abastecimiento autoservicio y Primax Prime para cuenta, vehículos, membresía e historial. En FuelFlow completa normalmente la operación sin intervención del Supervisor y puede solicitar asistencia. |
| SUPERVISOR | Trabajador operativo de una estación: abre/cierra turno, inicia y prepara la estación, deja FuelFlow listo, consulta estado operativo, terminal y surtidor asignados, atiende solicitudes e incidencias. No recibe permisos administrativos por asistir. |
| ADMIN | Administra una o varias estaciones dentro de su alcance: terminales y surtidores, bloqueo/desbloqueo de terminales, Supervisores, operaciones, inventario según permisos, incidencias, solicitudes administrativas y auditoría de sus estaciones. |
| SUPER_ADMIN | Gobierno de alcance global: administra todas las estaciones, Admins, roles/grants, asignaciones de estación, accesos globales, auditoría global y configuración global. |

## Flujo operativo del Supervisor

`Login → Abrir turno → Iniciar estación → FuelFlow listo`

El Supervisor puede cerrar turno y consultar operaciones activas que requieran atención. Pairing, CSRF, HMAC, cookies, credenciales y sesiones técnicas son procesos internos; no forman parte del flujo visible del trabajador.

La autorización efectiva siempre corresponde al Backend, que valida rol, grant y alcance en cada operación protegida. La interfaz no constituye una barrera de autorización. Esta página no establece un modelo de datos nuevo.
