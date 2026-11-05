# 00 — Visión del sistema Primax V2

Primax conecta FuelFlow en el surtidor, Primax Prime para clientes, Primax Control para personal autorizado, Backend NestJS/Prisma, PostgreSQL, reconocimiento de placas y PrintAgent.

Primax Control tiene un solo login. El Backend determina el rol, los grants activos y las estaciones asignadas. Administrador del sistema crea Administrador y Encargado; personal con `ADMIN_TERMINAL_MANAGE` habilita o suspende terminales. FuelFlow opera cuando su terminal está disponible y registra operaciones, inventario y comprobantes. La asistencia excepcional pasa a personal con grants de incidencias.

Las migraciones históricas de la baseline V12.1 se conservan para reproducir instalaciones existentes. El flujo vigente se especifica en `01-actors-and-roles.md` y `04-terminal-assistance.md`.
