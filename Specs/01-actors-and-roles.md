# 01 — Actores y roles

Primax Control admite tres perfiles humanos visibles: **Administrador del sistema**, **Administrador** y **Encargado**. El primero usa `SYSTEM_ADMIN` y `SUPER_ADMIN` internamente; los otros usan `ADMIN` y `ENCARGADO`. Cliente Prime es externo a Control.

| Perfil | Alcance |
| --- | --- |
| Administrador del sistema | Todas las estaciones y permisos de Control; crea cuentas y asigna grants y estaciones. |
| Administrador | Estaciones asignadas y grants activos. Puede gestionar terminales e incidencias si tiene los grants respectivos. |
| Encargado | Estaciones asignadas y grants activos. Consulta el estado de terminales y atiende asistencia con `ADMIN_INCIDENT_MANAGE`. La disponibilidad de FuelFlow es automática y no se activa ni suspende desde Control. |
| Cliente Prime | Usa Primax Prime y FuelFlow; no ingresa a Primax Control. |

El Backend valida cuenta aprobada, grant y alcance en cada ruta protegida. La interfaz refleja esos permisos. La operación de FuelFlow no requiere sesión de un empleado.
