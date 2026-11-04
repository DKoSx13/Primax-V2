# Staging V2 independiente — preparado, no desplegado

Repositorio `DKoSx13/Primax-V2`. Los recursos propuestos en `projects.json` son nuevos; no representan IDs/URLs ya provisionados. No se han cambiado proyectos, secretos, bases ni URLs V12.1. Fuente de despliegue propuesta: `validation/v2-integration`, publicada solo como rama de revisión, sin merge a main.

## Recursos y comandos

| Recurso V2 | Proveedor | Configuración |
| --- | --- | --- |
| primax-v2-fuelflow-staging | Vercel | root Frontend_1_FuelFlow; build npm run build; output dist; Node 22 |
| primax-v2-prime-staging | Vercel | root Frontend_2_PrimaxPrime; build npm run build; output www; Node 22 |
| primax-v2-control-staging | Vercel | root Frontend_3_PrimaxControl; build npm run build; output dist; Node 22 |
| primax-v2-backend-staging | Render | Blueprint render.yaml; runtime Node 22.23.4; build/generate/start; health /api/v1/health; autoDeploy off |
| primax-v2-ocr-staging | Render | Docker PlateRecognition, puerto 8000, health /health; secreto OCR compartido y URL HTTPS |
| primax-v2-staging / primax_v2_staging | Neon | Proyecto independiente, database explícita; pooled URL para runtime, directa para migración; TLS require |
| primax-v2-staging | Upstash | Nueva DB Redis REST HTTPS; namespace primax-v2-staging |

La separación de proyectos/root-directory de Vercel sigue su documentación oficial: https://vercel.com/docs/monorepos y https://vercel.com/docs/project-configuration/project-settings. El Blueprint usa la especificación vigente de Render y autoDeployTrigger off: https://render.com/docs/blueprint-spec. No se adquiere ningún plan de pago con estos archivos.

## Provisionamiento y variables

1. Conectar las cuentas Vercel/Render/Neon y disponer de acceso a Upstash. Registrar los IDs reales de cada nuevo recurso V2 antes de cualquier escritura. No reutilizar la DB ni credenciales de V12.1; tampoco una rama Neon que comparta datos de referencia sin aislamiento validado.
2. Crear el proyecto Neon V2 y la database `primax_v2_staging`, y Redis V2. Guardar las URLs/tokens únicamente en los gestores de secretos de cada hosting. `staging-v2.env.example` contiene placeholders deliberadamente inválidos y especifica qué variable corresponde a Backend, Functions o build público.
3. Antes del primer arranque, aplicar las migraciones desde un entorno de despliegue controlado con la URL directa de Neon V2 previamente verificada y backup si contiene datos. El comando estándar es `node node_modules/prisma/build/index.js migrate deploy`, dentro de Backend del build de V2. No usar las herramientas npm de pruebas locales contra cloud: sus guardas permanecen intactas. El Blueprint **no ejecuta migraciones automáticamente** ni corre seeds de V12.1.
4. Provisionar cuentas, grants, estaciones, surtidores y terminales propios de V2 mediante un procedimiento administrativo auditado; no dar credenciales administrativas al navegador ni ejecutar el seed local V12.1 en Neon. El SuperAdmin inicial requiere bootstrap explícito del nuevo entorno; no se simula como completado.
5. Configurar Backend/OCR en Render y crear los tres proyectos Vercel independientes. Usar los orígenes reales devueltos por los proveedores, no presumir disponibilidad de un nombre de dominio.
6. En **Control BUILD**, `FUELFLOW_PUBLIC_ORIGIN` debe ser exactamente el origen HTTPS público de FuelFlow V2, sin path ni slash final. `PRIMAX_CONTROL_API_URL=/api/v1`. En Control Functions: `BACKEND_ORIGIN` y `PRIMAX_CONTROL_PUBLIC_URL` exactos.
7. En FuelFlow Functions: `BACKEND_ORIGIN`, `FUELFLOW_PUBLIC_ORIGIN` y el mismo `KIOSK_GATEWAY_SECRET` privado del Backend. Build `FUELFLOW_KIOSK_AUTH=true` (Vercel activa el perfil de operador). En Prime BUILD: `PRIME_API_BASE_URL=<Backend V2 HTTPS>/api/v1`.
8. Backend: CORS solo los tres orígenes HTTPS V2; APP_MODE academic, DATABASE_PURPOSE academic-demo, PAYMENT_ENV demo y flag demo explícito. Cookies Secure/HttpOnly/SameSite=Strict, proxy same-origin de Control, CSRF, HMAC, sesión técnica y tickets de un uso permanecen activos. Redis no tiene fallback en memoria. `KIOSK_STATION_ID` debe identificar una estación provisionada en V2.
9. OCR: URL HTTPS exacta y `OCR_SERVICE_SECRET` privado idéntico en ambos servicios; no incluir el secreto en variables públicas ni en logs. Health no sustituye una petición funcional autenticada.
10. Ejecutar `node --env-file=<archivo local ignorado de preflight> tools/validate-staging-v2.cjs`. Es una validación sin I/O cloud. No basta con etiquetas: verificar también los IDs efectivos en los proveedores. Sus 9 tests usan datos ficticios y nunca consultan Neon.

## Validación pública pendiente

Una vez autenticados y creados los recursos: registrar URLs/IDs y commits desplegados; comprobar health/API/OCR; login Supervisor/Admin/SuperAdmin; station scope e intentos fuera de alcance; turno e inicio desde Control; consumo/replay/revocación del ticket; FuelFlow con asistencia y cancelación; pagos demo sin efectivo con reintento/reselección; membresía PRIME; comprobantes y cierre sin imprimir. Las pruebas destructivas, carreras y regresión E2E siguen exclusivamente locales. No ejecutar `migrate reset`, seed histórico, eliminación masiva ni tests de fixture sobre staging.

PrintAgent físico funciona solo en instalación local de origen permitido. No se promete impresión desde HTTPS público mientras no exista un transporte seguro compatible con sus restricciones actuales. La PeriPage A6 requerida no está instalada en este equipo; no se reemplazó por Epson, PDF ni impresión del navegador. Staging no se rotula validado antes de resolver este punto y probar la infraestructura real.

## Estado verificable

- Preparados manifiesto, Blueprint, variables y preflight, en PR propio.
- Sin sesiones CLI/variables de autenticación cloud en el entorno. Vercel/Render/Neon se encontraron disponibles para conectar, todavía no conectados; Upstash requiere acceso independiente.
- El navegador automatizable está vacío; el acceso directo al navegador habitual no pudo recuperar la ventana minimizada. No se extrajeron cookies ni contraseñas.
- No hay URLs V2 públicas verificadas. `FUELFLOW_PUBLIC_ORIGIN` está definido como requisito exacto en la plantilla y el validador; todavía no está configurado en un proyecto remoto inexistente.

La autorización del usuario ya permite continuar el despliegue. El bloqueo pendiente es acceso autenticado a las cuentas, no falta de permiso para trabajar.
