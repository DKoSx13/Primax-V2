# Validación y resultados

> Evidencia de la primera reestructuración. La actualización vigente de
> disponibilidad, logos y comprobantes está en
> [integración de frontends y comprobantes](integracion-frontends-comprobantes.md).

Fecha: 7 de noviembre de 2026. Entorno Windows, Docker Desktop/Engine 29.9.2,
contenedores Linux. Backend construido y probado también en Node 22 de su imagen;
Node del anfitrión es 24. No se ejecutó `git push` ni se modificó historial Git.

## A. Diagnóstico

Tres aplicaciones web existentes y un único proceso NestJS. OCR Python y agente
Windows independientes. Compose requería secretos, hash y UUID manuales; faltaba
la credencial OCR. Se conservaron módulos, Prisma, migraciones, diseños, pagos,
inventario y restricciones de terminal. Ver [diagnóstico inicial](diagnostico-inicial.md).

## B. Arquitectura final

Cuatro procesos NestJS independientes (identidad/clientes, catálogo, comercio,
administración), API Gateway HTTP y gateway kiosco firmado. OCR conserva Python.
Print demo es otro proceso sin impresora física. Las rutas públicas están en
`Backend/gateway/routes.cjs`; cada dominio tiene Swagger separado y guardas.
PostgreSQL conserva esquema compartido: no se afirma independencia total de datos.
Se mantienen juntos los componentes que participan en el cierre financiero SQL.

## C. Frontends

| Directorio | Propósito | URL demo |
| --- | --- | --- |
| Frontend_1_FuelFlow | Terminal, reconocimiento, pago y abastecimiento | http://127.0.0.1:26081 |
| Frontend_2_PrimaxPrime | Clientes, membresía, saldo, beneficios e historial | http://127.0.0.1:26082 |
| Frontend_3_PrimaxControl | Personal, permisos, operación, inventario y auditoría | http://127.0.0.1:26083 |

Verificados HTTP y navegación con Playwright: login de Prime y visualización de
saldo/puntos/vehículos; login de Control y panel conectado; FuelFlow completo
desde Inicio hasta boleta, impresión simulada y regreso a Inicio. Se conservó la
correspondencia de factura con RUC y razón social, cerrando además sin imprimir.
Se conservó la
versión Android de Prime sin requerir compilación de APK. No se hizo una revisión
visual exhaustiva de cada idioma, tamaño de pantalla ni cada formulario.

## D. Docker y persistencia

- Arranque exacto desde raíz con `docker compose up -d`, sin `.env`.
- 13 servicios permanentes saludables y cuatro tareas de inicialización con
  salida 0 (migración, seed base, administrador y operación).
- Puertos públicos loopback: 26000 API, 26081/26082/26083 webs.
- Servicios de dominio, PostgreSQL, Redis, OCR e impresión sin publicación.
- Healthchecks HTTP reales; dominios consultan PostgreSQL. Gateway agrega estado
  de dominios, OCR e impresión. PostgreSQL y Redis tienen checks propios.
- Volúmenes `postgres_data`, `redis_data`, `print_data`; proyecto nuevo
  `primax-fuelflow-demo` para no reutilizar ni alterar volúmenes antiguos.
- Dos copias limpias de fuentes, sin `.env`, node_modules, dist ni Git; construcción
  completa **sin caché** con descargas reales y bases inicialmente vacías.
  Última copia aislada: proyecto `primax-clean-final-20261107`, puertos
  26100/26181/26182/26183. Se conservó la copia temporal para inspección.
- Tras reiniciar el stack de auditoría se mantuvieron exactamente 3 usuarios,
  2 ventas, 2 pagos, S/ 42.60 y stock agregado 14992.429176 L. Los seeds se
  reejecutaron sin duplicar ventas ni reponer inventario.
- Al detener catálogo: salud agregada 503, rutas catálogo 502; al iniciarlo se
  recuperó el estado saludable. No se realizaron pruebas de caos exhaustivas.

## E. Correcciones principales

1. Valores demo automáticos y resolución de estación por código existente.
2. Credencial OCR compartida entre backend y Python.
3. Separación de AuthCore sin duplicar endpoints de login en cada dominio.
4. Compatibilidad de rutas superpuestas de membresía, pagos y Control.
5. Identificadores de correlación, timeouts y errores de gateway sin reintentos
   automáticos de cobros.
6. Impresión demo persistente, idempotente y explícita; integración Windows conservada.
7. Renovación de credencial técnica en terminal ociosa, con revocación y auditoría;
   bloqueo si hay una operación activa. El índice único ya no bloquea la renovación.
8. Cierre de FuelFlow referenciaba `ef-error` y `ef-ok`, eliminados del HTML al
   retirar efectivo. Se corrigió y se ejecutó el cierre real en navegador.
9. Tests portables en Docker sin nombres fijos de contenedor ni CLI Docker anidado.
10. Tipos explícitos en proyecciones administrativas y dobles de prueba; imports
    sin uso eliminados. Compilación TypeScript y lint sin errores.

## F. Pruebas ejecutadas

| Grupo | Resultado |
| --- | --- |
| Backend unitario | 215 pruebas, 27 suites |
| Integración PostgreSQL general | 229 pruebas |
| Incidentes, reembolsos y pagos demo históricos | 20 pruebas |
| Conciliación de inventario | 10 pruebas |
| Pagos V2, asistencia y numeración Prime | 15 pruebas |
| Control, cuentas, clientes y operaciones | 25 pruebas |
| Operación técnica de terminal | 3 pruebas |
| Reservas y ledger de inventario | 2 pruebas |
| FuelFlow | 142 pruebas |
| Prime | 28 pruebas |
| Control frontend | 27 pruebas |
| PrintAgent nativo, contratos y mocks | 56 pruebas |
| Rutas gateway | 23 pruebas |
| OCR Python | 12 pruebas |

Total: **807 pruebas**, más comprobaciones HTTP y de navegador. Las 45 pruebas
omitidas en el grupo general se ejecutan posteriormente con sus bases/perfiles
correctos: no son 45 pruebas pendientes. El runner de integración reúne 304
pruebas distintas. Las pruebas negativas de fallos SQL producen logs ERROR/WARN
esperados sin hacer fallar la suite.

`smoke-microservices.cjs` verificó frontends, JWT/401, cookie Control, catálogo,
OCR y vehículo, tarjeta demo, rechazo de sobreconsumo, precio confirmado,
idempotencia de venta, cierre, historial Prime, consulta de comprobante Control,
impresión simulada y cuatro contratos Swagger distintos. También comprobó que
un navegador nuevo no reemplace la credencial durante una operación abierta y
que la anterior deje de funcionar después de renovarla en una terminal ociosa.

PowerShell bloqueó inicialmente un test de PrintAgent. Se reejecutó con política
Bypass limitada a ese proceso, sin cambiar políticas permanentes ni imprimir.
No se probaron impresora, USB, cámara o surtidor físicos, cobros comerciales,
correo SMTP real, emisión SUNAT, Android instalado ni ejecución remota de CI.

## G. GitHub

Auditoría de patrones sobre fuentes versionadas y nuevas no ignoradas: sin
hallazgos de credenciales operativas. No equivale a un escaneo de todo el historial
Git. Los valores demo públicos se identifican como tales. `.env`, node_modules,
entornos virtuales, certificados, resultados y datos PrintAgent están ignorados.
Se agregaron dockerignore para OCR e impresión. Lockfiles y migraciones se
conservan. El workflow `.github/workflows/ci.yml` automatiza arranque y pruebas;
su ejecución en GitHub queda pendiente de publicar los cambios por el propietario.

Archivos principales: Compose, Dockerfile backend, `Backend/src/apps`, gateway,
AuthCore, integración kiosco, PrintAgent demo, scripts de validación, README y
documentos de arquitectura. No se modificaron los diseños de Prime ni Control.

## H. Conclusión y alcance

**El despliegue demo desde fuentes funciona con `docker compose up -d`.** No
requiere comandos manuales de Prisma ni instalación de runtimes en el anfitrión.
Habilitar una terminal desde Control sigue siendo una acción de negocio de la UI.
La separación de procesos está implementada y demostrada. El aislamiento de
esquemas/bases por dominio, certificación fiscal y operación física/comercial
siguen fuera del alcance de este demo y no se presentan como terminados.
