# 00 — Visión del sistema Primax V2

Primax conecta FuelFlow en el surtidor, Primax Prime para clientes, Primax Control para personal autorizado, Backend NestJS/Prisma, PostgreSQL, reconocimiento de placas y PrintAgent.

Primax Control tiene un solo login. El Backend determina el rol, los grants activos y las estaciones asignadas. Administrador del sistema crea Administrador y Encargado. FuelFlow está disponible automáticamente, sin activación desde Control, cuyo estado de terminal es de solo lectura. Se mantienen las restricciones de seguridad, operación única y surtidor activo. La asistencia excepcional pasa a personal con grants de incidencias.

Las migraciones históricas de la baseline V12.1 se conservan para reproducir instalaciones existentes. El flujo vigente se especifica en `01-actors-and-roles.md` y `04-terminal-assistance.md`.
