# Diagnóstico inicial — 7 de noviembre de 2026

Inspección del árbol versionado, Compose, Dockerfiles, módulos, controladores,
Prisma, seeds, suites y especificaciones antes de modificar la arquitectura.
No se encontró `Proyecto Software.docx` ni instrucciones AGENTS.md.

## Estado original

- FuelFlow: `Frontend_1_FuelFlow`, HTML/CSS/JS, build propio sin dependencias,
  Nginx y gateway Node que firma solicitudes de kiosco (HMAC), cookies y CSRF.
- Prime: `Frontend_2_PrimaxPrime`, HTML/CSS/JS, portal de membresías, vehículos,
  saldo, deuda e historial; JWT. También conserva Android/Capacitor opcional.
- Control: `Frontend_3_PrimaxControl`, HTML/CSS/JS, sesión administrativa por
  cookie, roles, grants y alcance por estación. Build propio y Nginx.
- Backend: una aplicación NestJS 11/TypeScript, Prisma 6, PostgreSQL y Redis.
  Auth, clientes, transacciones, pagos, puntos, inventario, asistencia y
  administración se ejecutan en el mismo proceso; los módulos no son servicios.
- OCR: Flask/Gunicorn, OpenCV y Tesseract, aplicación independiente existente.
- PrintAgent: Node y adaptadores nativos de impresión; requiere equipo e
  impresora compatibles. No es requisito para finalizar sin impresión.

## Hallazgos y riesgos

1. Compose exige numerosas variables sin valores demo, un hash bcrypt y el UUID
   de una estación obtenido después del seed: impide el arranque sin preparación.
2. El adaptador OCR envía `OCR_SERVICE_SECRET`, pero Compose no lo configura ni
   en el backend ni en OCR: reconocimiento puede fallar aun con contenedor sano.
3. Los tres frontends ya conservan proxies relativos `/api/v1`; deben seguir
   funcionando con el mismo contrato y sin secretos en los bundles.
4. Prepago, reserva, saldo, pago, puntos y cierre usan transacciones SQL y bloqueos
   compartidos. Separarlos precipitadamente por HTTP rompería atomicidad. Se
   conservarán juntos en un núcleo comercial, con límites explícitos documentados.
5. Administración modifica entidades de varios dominios; base compartida implica
   acoplamiento real que debe declararse como transición, sin fingir aislamiento.
6. Existen migraciones y seeds con upsert/actualización vacía, volumen PostgreSQL,
   Redis persistente, bloqueo de bases remotas y suites extensas de negocio.
   Deben conservarse, incluyendo datos, precios confirmados e idempotencia.
7. Integración comercial Culqi y recuperación SMTP existen, pero la demostración
   debe usar pagos simulados y recuperación deshabilitada sin claves externas.
8. Documentación Specs distingue reglas actuales de referencias V12.1; no se
   debe restaurar efectivo ni presentar comprobantes demo como emisión SUNAT.
9. No se encontró un documento académico Word. Fuentes y Specs son referencia.

## Estrategia

Separar aplicaciones reales de identidad/clientes, catálogo, núcleo comercial y
administración. Gateway HTTP sin lógica de negocio. Reutilizar módulos y guardas,
evitando duplicar implementaciones financieras. Conservar OCR y los tres builds.
Mantener el esquema PostgreSQL durante la transición para no destruir relaciones
ni datos. Verificación aislada con un nombre Compose y volúmenes nuevos.

Docker Engine está disponible. Node anfitrión es 24 y el proyecto declara 22;
las verificaciones definitivas deben usar la imagen Node 22 del proyecto.
