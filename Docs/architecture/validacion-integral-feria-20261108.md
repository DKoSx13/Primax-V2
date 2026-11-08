# Validación integral feria — 8 noviembre 2026

## Resultado

**Candidata no aprobada todavía.** El arranque integral quedó bloqueado durante la construcción de la imagen NestJS. No se validaron recorridos de extremo a extremo ni persistencia tras reinicio. No se alteraron los contenedores originales ni se ejecutaron migraciones sobre sus bases.

## Preparación y aislamiento

Se leyó `integracion-feria-20261108.md` y se comprobó que Git sigue en `qa/feria-integration`, con `MERGE_HEAD` presente y sin conflictos pendientes. Se inventariaron contenedores, redes, puertos y volúmenes existentes. El proyecto `primax-feria-check` no existía antes de la prueba. El Compose resuelto con entorno mínimo (`env -i`) habría creado redes `primax-feria-check_web` y `_data`, volúmenes `primax-feria-check_postgres_data`, `_redis_data`, `_print_data`, y solo habría publicado `127.0.0.1:27100,27181,27182,27183`; los cuatro puertos estaban libres. Las URLs resueltas de PostgreSQL, Redis, OCR y gateway usaban nombres de servicio internos, sin Neon, Upstash, Render ni Vercel.

## Construcción y ejecución

Se inició `docker compose build` con el proyecto y puertos aislados. Las etapas de OCR, frontends, gateway, PrintAgent, migración y seeds construyeron sus imágenes. El compilador del backend terminó correctamente dentro de Docker, pero BuildKit quedó detenido al exportar la imagen `primax-feria-check-domain:demo`, compartida por los servicios NestJS. Se interrumpió solo la construcción propia y se probó `docker compose build backend`; también quedó detenido al inicio. Una inspección de imagen por Docker agotó el tiempo de espera. Se canceló esa segunda construcción. No se ejecutó `docker compose up`, por lo que **no se iniciaron contenedores del laboratorio**, ni migraciones, seeds, healthchecks, smoke tests o reinicios.

Las imágenes parciales del proyecto permanecen disponibles para revisión; no se eliminaron imágenes, datos, redes ni volúmenes. PostgreSQL y Redis del laboratorio no fueron creados. Este bloqueo de Docker impide comprobar el estado integral de microservicios y base de datos.

## Funcionalidad

No se ejecutó un navegador ni los recorridos solicitados en el laboratorio. Las pruebas previas de unidades y el E2E de comprobantes en una base local aislada constan en `integracion-feria-20261108.md`; no sustituyen esta validación. Quedan pendientes: apertura FuelFlow, sesión técnica y recuperación, OCR por imagen, prepago y postpago, finalización con y sin impresión demo, Control, asistencia, Prime y persistencia después de reinicio.

Prueba manual propuesta una vez recuperado Docker: levantar `primax-feria-check`; verificar `docker compose ps` y `/api/v1/health` por `27100`; abrir `27181`, `27182` y `27183` en navegador; completar una venta prepago y otra postpago con placa de fixture; comprobar números distintos en Prime y Control; finalizar una sin impresión y otra con PrintAgent demo, comprobando `simulation=true` y `physicalConfirmed=false`; iniciar una atención nueva sin activar terminal desde Control; simular pérdida de navegador y recuperar sesión; enviar asistencia y resolverla; reiniciar únicamente los servicios del laboratorio y volver a consultar las ventas y comprobantes.

## Auditoría npm

`npm audit` del Backend reportó 18 hallazgos: 7 bajos, 8 moderados y 3 altos. Con `--omit=dev` quedan 4 de producción: `@nestjs/platform-express` (alto, vía `multer`), `multer` (alto, DoS del fileFilter pendiente), `body-parser` (alto, DoS con bytes tras cuerpo comprimido) y `qs` (moderado, TypeError en `stringify`). `body-parser` y `qs` muestran corrección compatible en el árbol de dependencias; npm propone Nest 12.4.0 para `multer`, salto mayor que requiere compatibilidad y pruebas.

Los 14 restantes son del árbol de desarrollo: Jest, ts-jest, TypeScript ESLint, minimatch y dependencias relacionadas. Parte de sus correcciones disponibles requieren saltos mayores o cambios del árbol; no se aplicó `audit fix --force`. No se actualizaron paquetes durante esta validación. Los tres altos de producción son un riesgo abierto para la feria, sobre todo si endpoints de carga de archivos se exponen a clientes no confiables.

## Siguiente paso

Diagnosticar BuildKit/daemon sin reiniciar ni afectar los proyectos originales; completar exportación de la imagen NestJS y levantar exclusivamente `primax-feria-check`. Ejecutar el smoke del repositorio con `FRONTEND1_PORT=27181 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183 API_ORIGIN=http://127.0.0.1:27100`, completar postpago y persistencia, y repetir auditoría tras cualquier ajuste de dependencias. No aprobar la versión candidata hasta que estos recorridos pasen.
