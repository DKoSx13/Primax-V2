# Primax V2

**Baseline técnica validada:** Primax V12.1 con hotfix `hotfix/v12-1-control-proxy` (`548af3e`). Este repositorio inicia la evolución Primax V2 guiada por SDD. La validación local de la baseline y sus límites están registrados en [`Docs/technical-readiness.md`](Docs/technical-readiness.md).

## Componentes

- `Frontend_1_FuelFlow/`: autoservicio y operación del cliente en el surtidor.
- `Frontend_2_PrimaxPrime/`: portal del cliente, cuenta, vehículos, membresía e historial.
- `Frontend_3_PrimaxControl/`: aplicación administrativa única; un login y vistas según cuenta, roles, grants y alcance.
- `Backend/`: NestJS, Prisma, reglas de negocio, autenticación y autorización. `Backend/prisma/` conserva el esquema y las migraciones ejecutables.
- `Database/`: documentación, diagrama y SQL auxiliar de PostgreSQL.
- `PlateRecognition/`: OCR de placas.
- `PrintAgent/`: agente local de impresión.
- `Infrastructure/`: mapa de infraestructura y despliegue; los archivos ejecutables permanecen donde sus rutas funcionan.
- `Specs/`: decisiones y especificaciones de V2; `Specs/V12.1-reference/` conserva las especificaciones de referencia.
- `Tests/`: estrategia general de pruebas. Los tests ejecutables permanecen junto a sus componentes; `tools/` conserva utilidades transversales.
- `Docs/`: documentación; `Docs/V12.1-reference/` conserva la documentación de la baseline.

## Desarrollo guiado por SDD

Las decisiones funcionales aprobadas están en [`Specs/`](Specs/), empezando por [`03-approved-decisions.md`](Specs/03-approved-decisions.md). Esas Specs gobiernan los siguientes incrementos. La creación de este repositorio conserva la baseline V12.1 validada; el nuevo flujo Supervisor, asistencia V2, formato público `PRIME-...`, cambios de pagos e impresión y nueva UI por roles todavía no están implementados.

La arquitectura separa FuelFlow, Primax Prime, Primax Control, Backend NestJS/Prisma/PostgreSQL, OCR y PrintAgent. Los tests ejecutables permanecen con cada componente; la estrategia e inventario están en [`Tests/README.md`](Tests/README.md). Los archivos de Compose, Docker, Vercel y Capacitor deben revisarse integralmente antes de desplegar esta copia en staging o producción.
