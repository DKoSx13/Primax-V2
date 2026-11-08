# Primax FuelFlow

Prototipo académico de autoservicio de combustible: FuelFlow para la terminal,
Primax Prime para clientes y Primax Control para personal autorizado. Conserva
PostgreSQL/Prisma, OCR local y las reglas de pago, reserva y cierre existentes.

## Inicio desde GitHub

Requisitos: Git y Docker Engine con Compose v2 o Docker Desktop en modo Linux.
Reservar como referencia 4 GB de memoria libre y espacio para imágenes; la primera
construcción necesita Internet. No hace falta instalar Node, Python ni PostgreSQL.

```bash
git clone <URL-de-este-repositorio>
cd Primax-V2
docker compose up -d
```

No hay que copiar `.env.example`. Compose incluye valores públicos **solo para
demostración local**, construye las aplicaciones, espera PostgreSQL, aplica
migraciones y ejecuta seeds idempotentes. El primer inicio puede tardar varios
minutos. `docker compose ps` muestra los servicios permanentes saludables;
`migrate` y los tres seeds terminan con código 0.

| Aplicación | Directorio real | URL |
| --- | --- | --- |
| FuelFlow: venta y abastecimiento | `Frontend_1_FuelFlow/` | http://127.0.0.1:26081 |
| Prime: membresía, vehículos, saldo e historial | `Frontend_2_PrimaxPrime/` | http://127.0.0.1:26082 |
| Control: operación, inventario y permisos | `Frontend_3_PrimaxControl/` | http://127.0.0.1:26083 |
| API Gateway y salud agregada | `Backend/gateway/` | http://127.0.0.1:26000/api/v1/health |

Prime conserva su proyecto Android/Capacitor; no se necesita una APK. Todos los
frontends usan `/api/v1` en su propio origen. FuelFlow conserva además su gateway
de sesiones, firma HMAC y protección CSRF.

## Cuentas y recorrido demo

| Cuenta | Usuario | Contraseña demo |
| --- | --- | --- |
| Cliente Prime | `demo@primaxprime.pe` | `PrimaxDemo123!` |
| Administrador del sistema | `control-admin@primax.local` | `AdminDemoLocal123!` |
| Encargado | `encargado@primax.local` | `EncargadoDemo123!` |
| Operador compatible con login anterior | `operador` | `OperadorDemo123!` |

1. Abrir FuelFlow directamente: `PRIMAX-SUR-T01` está disponible automáticamente,
   sin iniciar sesión ni habilitarla desde Control. El dashboard muestra su estado
   en modo de solo lectura. Se conservan los bloqueos por fallos reales de seguridad.
2. Abrir FuelFlow, seleccionar idioma e iniciar. Usar `ABC-123` para el cliente
   demo o introducir manualmente otra placa válida. OCR acepta imágenes.
3. Elegir combustible y prepago con tarjeta simulada, Yape o Plin demo. Los pagos
   digitales deben confirmarse en su flujo demo antes de autorizar el despacho.
4. Finalizar con boleta o factura demo. **No imprimir y finalizar** cierra normalmente;
   **Imprimir y finalizar** guarda un trabajo simulado e informa que no se imprimió papel.
5. Consultar el consumo en Prime y la operación/comprobante en Control.

Una atención vacía abandonada se recupera automáticamente después de dos minutos
sin actividad, verificando que no exista evidencia financiera, de inventario ni
incidencias pendientes. La sesión original mantiene su actividad mientras está
abierta y visible. Un pago o despacho pendiente nunca se elimina por tiempo:
requiere recuperar la sesión original o una intervención autorizada.
Ver [recuperación de terminal y logos PNG](Docs/architecture/recuperacion-terminal-y-logotipos.md).

Prime comienza sin saldo artificial. Su recarga demo permite probar postpago con
saldo Prime. Se mantienen precios confirmados, límites, idempotencia por
`operationId` e historial. No se acepta efectivo. Los comprobantes son
demostrativos: **no constituyen emisión electrónica SUNAT**.

Las boletas reciben `EB01-0001`, `EB01-0002`… y las facturas `FT01-0001`,
`FT01-0002`… desde PostgreSQL, con secuencias independientes y persistentes.
Cada venta conserva un único registro `Receipt`, visible en FuelFlow, Prime,
Control y el contrato de impresión. Reimprimir no emite otro número. Después de
9999 se continúa con 10000; un rollback puede dejar un hueco y nunca reutiliza
el valor reservado. [Implementación y validación](Docs/architecture/integracion-frontends-comprobantes.md).

## Arquitectura ejecutable

NestJS 11, Node 22, TypeScript, Prisma 6, PostgreSQL 17, Redis 7, JavaScript,
HTML/CSS, Nginx, Flask, OpenCV y Tesseract.

| Proceso / contenedor | Responsabilidad |
| --- | --- |
| `backend` | Gateway HTTP: rutas, correlación, timeouts y salud; sin reglas financieras |
| `identity-service` | Registro/login JWT, recuperación, kiosco, perfiles, membresías, vehículos y OCR |
| `catalog-service` | Combustibles, precios, estaciones, disponibilidad y beneficios |
| `commerce-service` | Autorizaciones, pagos, reservas, transacciones, saldo, puntos, canjes, comprobantes, terminales y asistencia |
| `administration-service` | Control, grants, consultas, incidencias, auditoría y gestión de inventario |
| `plate-recognition` | OCR Python independiente con credencial interna y fallback manual |
| `print-service` | Adaptador demo sin drivers ni impresión física |
| `fuelflow-gateway` | Frontera de seguridad específica del kiosco, conservada |

Los cuatro servicios NestJS tienen entradas distintas en `Backend/src/apps/` y
contenedores separados. Comparten imagen para reutilizar dependencias; cada
entrada carga sus módulos y guardas comunes. `Backend/src/main.ts` y `AppModule`
se conservan para herramientas y pruebas anteriores; Compose no los ejecuta.

La separación es gradual: un esquema PostgreSQL compartido, consultas cruzadas y
escrituras administrativas controladas por reglas existentes. Pagos, puntos,
saldo, inventario reservado y comprobante permanecen en el límite transaccional
comercial. No se afirma aislamiento total de datos ni diez servicios financieros
independientes. Ver [arquitectura](Docs/architecture/arquitectura.md).

## Estructura y API

```text
compose.yaml                 # despliegue local completo
Backend/src/apps/            # identity, catalog, commerce, administration
Backend/gateway/             # contrato de rutas y proxy
Backend/src/                 # módulos de negocio conservados
Backend/prisma/              # esquema, migraciones y seed
Frontend_1_FuelFlow/          # terminal web + gateway firmado
Frontend_2_PrimaxPrime/       # web + Android opcional
Frontend_3_PrimaxControl/     # administración web
PlateRecognition/            # OCR y fixtures
PrintAgent/                  # agente Windows real + adaptador demo Docker
Docs/architecture/           # diagnóstico, decisiones, despliegue y validación
Specs/                       # requisitos y referencias históricas
tools/                       # auditoría y pruebas transversales
```

Contratos públicos: [rutas del gateway](Backend/gateway/routes.cjs).
Swagger por dominio, disponible en modo local:

- http://127.0.0.1:26000/docs/identity/api/docs/
- http://127.0.0.1:26000/docs/catalog/api/docs/
- http://127.0.0.1:26000/docs/commerce/api/docs/
- http://127.0.0.1:26000/docs/administration/api/docs/

JSON: `/docs/<dominio>/api/docs-json`. Cada servicio valida JWT, sesiones, roles y
permisos independientemente; el gateway no sustituye esas validaciones.

## Persistencia y configuración

Volúmenes `postgres_data`, `redis_data` y `print_data`. Migraciones con
`prisma migrate deploy`; seeds con upsert sin reponer saldos, inventario ni
sobrescribir contraseñas. Reiniciar o detener conserva datos. No usar `down -v`
si se desea conservarlos.

El proyecto Compose se llama `primax-fuelflow-demo`. Los volúmenes previos
`primax-v12-1_*` permanecen intactos y no se importan automáticamente al demo.
Para reutilizar una instalación anterior, conservar su nombre de proyecto y sus
variables/credenciales originales; revisar y respaldar esa base antes de migrarla.

`.env.example` contiene overrides opcionales. Puertos: `FRONTEND1_PORT`,
`FRONTEND2_PORT`, `FRONTEND3_PORT`, `BACKEND_PORT`. Los servicios internos usan
DNS Docker y puertos del contenedor; PostgreSQL, Redis, OCR y dominios no publican
puertos. Se pueden cambiar las contraseñas demo antes del primer seed; una base
existente no recibe contraseñas nuevas automáticamente.

Reemplazar `JWT_SECRET`, `KIOSK_API_KEY`, `KIOSK_GATEWAY_SECRET`,
`OCR_SERVICE_SECRET` y contraseñas de bases en cualquier instalación privada real.
El demo escucha solo en loopback; no es una receta de producción. SMTP está
deshabilitado y los adaptadores comerciales permanecen en el código. No hay
dependencia obligatoria de Culqi, correo ni servicios de IA.

La estación se resuelve por `PRIMAX-SUR`, preservando el UUID existente; se puede
fijar `KIOSK_STATION_ID`. El kiosco admite localhost y 127.0.0.1 en su puerto.
Para imprimir físicamente, configurar el agente Windows compatible y establecer
`FUELFLOW_PRINT_DEMO=false`, reconstruyendo `frontend1`. El demo Linux no accede
al USB de Windows.

## Diagnóstico y parada

```bash
docker compose ps -a
docker compose logs --tail 100
docker compose logs -f backend commerce-service
docker compose restart
docker compose stop
docker compose down
```

Los clientes conservan el UUID para recuperar/reintentar ante fallos. Los logs
del gateway incluyen `X-Request-Id`, dominio, estado y duración, sin cuerpos ni
credenciales. La salud agregada puede degradarse con otros dominios disponibles.

## Pruebas

Sin instalar Node en el anfitrión:

```bash
docker compose --profile test run --build --rm backend-tests npm test -- --silent
docker compose --profile test run --rm backend-tests node --test gateway/routes.test.cjs
docker compose --profile test run --rm backend-tests
docker compose exec plate-recognition python -m unittest test_ocr test_v11
```

El runner de integración usa bases separadas y esquemas temporales, sin eliminar
volúmenes demo. Ejecuta también las suites históricas en sus perfiles/bases
específicos; ver [resultados reales](Docs/architecture/integracion-frontends-comprobantes.md).

Con Node para desarrollo: `npm test` en cada frontend y PrintAgent; en Backend,
`npm ci`, `npm run prisma:generate`, `npm run build`, `npm test`.
`node tools/smoke-microservices.cjs` verifica APIs y escribe ventas demo: usar un
stack aislado. `node tools/validate-clean-compose.cjs` crea una copia de fuentes
sin dependencias locales, construye sin caché y levanta otro proyecto en puertos
26100/26181/26182/26183. Estos scripts son validación, no pasos de instalación.

## Extensión y limitaciones

Para añadir un dominio, crear `Backend/src/apps/<dominio>/main.ts` con
`bootstrapDomain`, módulos, controladores/DTO y pruebas. Registrar contenedor,
healthcheck, rutas ordenadas en `Backend/gateway/routes.cjs`, origen en el gateway
y documentación. Definir primero propietario de datos y coordinación: una
transacción SQL no se puede distribuir mediante HTTP sin compensación y estados.

Límites actuales: esquema y guardas compartidos; núcleo comercial amplio; OCR
orientado a placas demo; impresora y cámara físicas no verificadas; sin emisión
fiscal ni cobros comerciales. Los tres diseños web se conservan. Las referencias
de staging en Infrastructure requieren revisión antes de otro despliegue.
No se ha publicado ni enviado nada a GitHub.
