# Siguiente misión propuesta: independencia arquitectónica de Identity

Preparada para autorización posterior; no iniciada. No depende de activar tráfico
Catalog ni de mover carpetas. La transición pública de inventario sigue como trabajo
separado, con su exposición temporal expresamente aprobada y registrada.

Objetivo acotado: extraer primero núcleo y puertos de Identity conservando los
entrypoints, APIs y persistencia actuales. No separar bases ni cambiar pagos.

Responsabilidad: autenticación, cuentas/usuarios, authVersion/revocación, sesiones,
permisos de identidad, vehículos y vínculo/identificador de membresía. Reservas,
saldo, deuda, recargas, pagos, puntos y redenciones siguen en Commerce.

Orden ejecutable:
1. Inventariar imports y accesos Prisma de AuthCore, Users, Vehicles y Memberships;
   registrar tablas compartidas, contratos y consumidores. Partir del código real,
   no solo de nombres de módulos.
2. Congelar contrato de actor: kind, userId/terminalId, stationId/stationIds,
   permisos, global, expiración y versión/revocación. Mantener AuthCore operativo
   como adaptador mientras se extraen casos de uso sin Nest/HTTP/Prisma.
3. Introducir puertos de usuarios, credenciales, sesiones, grants/estaciones,
   recuperación y vehículos. Adaptadores existentes delegan sin cambiar contratos;
   no implementar nuevos requisitos de registro/correo.
4. Separar consultas financieras de Memberships detrás de un puerto de Commerce,
   preservando la respuesta compatible. No fragmentar transacciones atómicas ni
   convertir autenticación en dueña de saldos o inventario.
5. Evaluar después verificación local frente a introspección y su consistencia de
   revocación. No distribuir indiscriminadamente la clave HS256 entre proyectos.

Criterios de aceptación: núcleo ejecutable sin framework/persistencia, sin imports
entre proyectos independientes; pruebas reales de login/expiración/revocación,
Control por permisos/estación y terminales; contratos Prime/FuelFlow/Control sin
regresiones; fallo de identidad sin permitir acceso por defecto; pruebas sintéticas
sin datos reales. Proponer el despliegue independiente como etapa posterior.

Decisiones que esa misión debe resolver antes de separar procesos/datos: propiedad
final de grants de Control, latencia permitida de revocación y estrategia de
validación de tokens. No son un motivo para alterar los permisos existentes ahora.
