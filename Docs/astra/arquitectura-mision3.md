# Límites de extracción y despliegue

Catalog inicia la separación con un proyecto independiente de lectura. No tiene
imports fuera de su directorio y puede exportarse a `primax-catalog` con su lockfile,
Dockerfile y tests. La fachada de autenticación actual permanece en Backend y la
comprobación de paridad precede al cambio de tráfico. No se crearon repositorios
remotos. No se afirma independencia física de datos ni migración completa.

| Proyecto futuro | Dependencias por separar | Condición de integración |
|---|---|---|
| Catalog | Fachada AuthCore, filtrado kiosk, Prisma compartido del proceso anterior | Adaptador HTTP autenticado y pruebas de alcance; retirar repositorios anteriores tras cambio de tráfico |
| Identity | Sesiones kiosk/Control, Redis, usuarios/grants, correo | Contratos de verificación de identidad y revocación; no compartir secretos de firma indiscriminadamente |
| Commerce | Operaciones, pagos, inventario, comprobantes, reservas, Prime balance | Mantener transacción PostgreSQL atómica; outbox/idempotencia antes de separar persistencias |
| Administration | Grants, auditoría, estaciones, recuperación | Consultas por red y comandos autorizados; no escribir tablas Commerce directamente |
| API Gateway | Routing existente y gateways kiosk | Preservar firma, CSRF, cookies por puerto, límites y rechazo por defecto |

## Entornos reproducibles

| Entorno | Proyecto/red/volúmenes | Configuración y datos |
|---|---|---|
| DEV | `primax-dev-*` exclusivos, PostgreSQL Docker | Fixtures sintéticos; secretos locales ignorados |
| QA | `primax-astra-qa`, puertos 281xx; Catalog paralelo 28210 | Datos financieros preservados; inspección antes de escribir |
| STAGING | `primax-staging-*`, infraestructura separada | Secretos de entorno protegidos; migraciones compatibles; aprobación de despliegue |
| PROD/DEMO | `primax-production-*` o demo local independiente | Sin compartir datos/secrets/volúmenes con QA; publicación pendiente de autorización |

Solo QA y el proyecto Catalog tienen implementación verificable en esta sesión.
DEV/STAGING/PROD son diseño, no despliegues realizados. Las configuraciones deben
inyectarse por entorno y las imágenes promoverse por digest. Pipelines separados:
contratos → tests → build → revisión de compatibilidad → aprobación → despliegue.
No ejecutar migraciones en el arranque de servicios de lectura.

Neon queda como candidato a evaluar para STAGING/PROD; no se usaron cuentas,
credenciales ni bases remotas. Antes de adoptarlo comprobar pooling frente a
conexiones directas, TLS, límites, backups y recuperación, latencia y aislamiento
por proyecto/rol. No se ha medido ni certificado esa alternativa.

Extraer repositorios con el contenido del proyecto y pipeline ajustado a raíz,
conservando referencia al commit origen. No copiar secretos, node_modules ni
evidencias HTTP. Publicar contratos versionados antes de cambiar consumidores.
