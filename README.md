# Primax V2

Primax V2 conecta FuelFlow (autoservicio), Primax Prime (cliente), Primax Control (personal autorizado) y Backend NestJS/Prisma/PostgreSQL. OCR de placas y PrintAgent completan la operación.

Primax Control usa los perfiles Administrador del sistema, Administrador y Encargado. Los grants y estaciones asignadas determinan el acceso. El personal con `ADMIN_TERMINAL_MANAGE` habilita o suspende terminales; FuelFlow consulta el estado persistente antes de iniciar una operación. La asistencia e incidencias usan `ADMIN_INCIDENT_VIEW` y `ADMIN_INCIDENT_MANAGE`.

La arquitectura y las reglas actuales están en [`Specs/`](Specs/). [`Specs/V12.1-reference/`](Specs/V12.1-reference/) y [`Docs/V12.1-reference/`](Docs/V12.1-reference/) conservan referencias históricas. El esquema ejecutable y sus migraciones están en [`Backend/prisma/`](Backend/prisma/).

## Componentes

- `Frontend_1_FuelFlow/`: autoservicio en terminal.
- `Frontend_2_PrimaxPrime/`: portal y app del cliente.
- `Frontend_3_PrimaxControl/`: administración y operación autorizada.
- `Backend/`: API, reglas, autenticación, Prisma y pruebas.
- `PlateRecognition/`: OCR de placas.
- `PrintAgent/`: impresión local.
- `Infrastructure/`: referencias de infraestructura y despliegue.

Los scripts locales bloquean bases remotas. El bootstrap futuro de staging está en `Backend/scripts/seed-v2-staging.cjs` y exige confirmación explícita y base vacía.
