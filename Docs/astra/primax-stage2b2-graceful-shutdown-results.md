# Astra — Etapa 2B.2: graceful shutdown y aceptación con observaciones

Fecha local: 2026-11-18. Rama: `feat/dezkz-identity-a4-core`. HEAD inicial/final: `f05027ff86f5a03aba12ffeb528f2d001209d747`. No se crearon commits, push ni merge. Etapa 3 no iniciada.

**Conclusión:** cierre ordenado validado para los casos ejecutados en los dos BFF y PrintAgent demo. Ninguno necesitó SIGKILL en las paradas normales comprobadas. Se recomienda aceptar el cierre de la validación 2B **con la incidencia T01 expresamente abierta y pendiente de resolución funcional**, no como equivalencia universal ni cierre sin observaciones. El commit y cualquier avance de Etapa 3 requieren la autorización siguiente.

## 1. Verificación inicial y preservación

Coincidieron rama, HEAD, seis rutas en staging y nueve archivos originales sin seguimiento. Se inspeccionaron las rutas preparadas y se comprobaron sus contenidos frente a valores privados conocidos y patrones de tokens/secretos. Se capturaron hashes del contenido de trabajo y del índice de esas seis rutas.

Las seis rutas anteriores y los nueve originales permanecen idénticos. Se calcularon huellas de los **siete volúmenes anteriores** (tres de 2B y cuatro de 2B.1) con montajes readonly en utilidades sin red: coinciden antes y después. Los tres volúmenes originales también coinciden con las huellas registradas en 2B.1. No se arrancó ningún PostgreSQL/Redis anterior ni se ejecutaron consultas, migraciones o seeds en esta etapa. El control de integridad lee archivos en modo readonly; no es una prueba de restauración o de todos los metadatos del filesystem.

No se borraron ni sobrescribieron las evidencias anteriores. Se conservaron también los resultados de la primera ejecución de esta etapa y las rondas posteriores en rutas nuevas dentro de `.cache/astra-stage2b2/`. Los nueve archivos brutos de 2B continúan fuera del staging por la revisión de privacidad previa.

## 2. Rutas exactas y alcance del cambio

| Ruta operativa modificada | Proceso |
|---|---|
| `Frontend_1_FuelFlow/server/local.js` | Entrada Node del BFF de FuelFlow; utilizada por T01 y T02 |
| `PrintAgent/demo-server.mjs` | Entrada Node del servicio de impresión demo; no usa impresoras físicas |

No se modificaron `Frontend_1_FuelFlow/server/gateway.js`, el API Gateway de Backend, las interfaces HTML/JS/CSS, AuthCore, PasswordReset, permisos, schema/migraciones, Dockerfiles o Compose operativo. La modificación del entrypoint BFF es la excepción expresa autorizada dentro de la carpeta del frontend; no reorganiza la interfaz ni inicia Etapa 3.

El cuerpo del handler HTTP de impresión se conserva textualmente igual al de HEAD tras normalizar saltos de línea; se encapsuló para observar su finalización. El formato, validación, escritura y replay/conflicto de jobs no se reescribieron.

## 3. Cómo funciona el cierre

1. SIGTERM y SIGINT llaman al mismo handler. Una bandera hace que las señales posteriores no vuelvan a cerrar el servidor ni reinicien el plazo.
2. `server.close()` deja de aceptar conexiones. `closeIdleConnections()` retira conexiones ociosas.
3. Una solicitud nueva que llegue por una conexión HTTP ya establecida durante el drenaje recibe 503 vacío con `Connection: close`; no se delega al handler de negocio. Es un rechazo de admisión durante apagado, no un cambio del contrato HTTP normal.
4. Se cuenta el trabajo aceptado antes de la señal. El BFF espera la Promise del gateway existente; PrintAgent espera su handler y las escrituras que éste ya aguardaba. El contador se libera con `finally`, incluso si el cliente se desconecta.
5. El cierre sólo se considera completo cuando terminó el cierre del servidor y no quedan handlers aceptados en curso. Entonces se retira el timer y Node sale naturalmente con código 0; no se fuerza una salida 0 con trabajo pendiente.
6. Si el trabajo no termina, a los 8.000 ms se registra un motivo fijo, se cierran conexiones y se sale con código 1. No se imprime URL, body, cookie, token, identidad o mensaje de excepción. Este camino es **fallo acotado**, no graceful exitoso.

El laboratorio configura `stop_grace_period: 10s`, verificado como StopTimeout=10 en los contenedores. El plazo de aplicación deja dos segundos de margen y terminó antes de que Docker enviara KILL. El Compose operativo se conserva sin cambios; una política futura que reduzca su presupuesto por debajo del plazo de aplicación requiere revisar su alineación, no asumir que el código puede conocer un override externo de Docker.

No se añaden reintentos, comandos de cierre de atención, reembolsos ni operaciones compensatorias. Los auxiliares no controlan las transacciones SQL del Backend. Un timeout de transporte no acredita el resultado financiero de una petición remota; no debe interpretarse como permiso para repetir una operación con una clave nueva.

## 4. Entorno aislado y pruebas

Proyecto nuevo: `primax-astra-stage2b2-ca280f1ed7`, red interna propia `10.253.214.0/27`, sin puertos publicados. Se construyeron imágenes BFF y PrintAgent con sus Dockerfiles existentes y tags exclusivos del proyecto. Se creó un único volumen nuevo de impresión; no se montaron volúmenes anteriores en los servicios de prueba.

Un servidor fixture de catálogo atendió HTTP dentro de esa red. No contiene cuentas, bases de datos ni endpoints financieros. El cliente de prueba estuvo en la misma red, sin Docker socket y con su código montado readonly. La clave técnica del BFF se generó para la ejecución y permanece sólo en la configuración privada ignorada. No hubo pagos, usuarios reales, sesiones operativas ni impresoras físicas.

Se ejecutaron dos rondas; la segunda reconstruyó los artefactos con el código final y guardó sus resultados separadamente. Las conclusiones numéricas siguientes corresponden a esa ronda final.

### Señales y drenaje: doce escenarios

| Auxiliar | TERM sin trabajo | INT sin trabajo | Trabajo en curso + TERM/INT/TERM | Petición deliberadamente inconclusa |
|---|---|---|---|---|
| BFF T01 | exit 0; 1,15 s | exit 0; 1,09 s | exit 0; 1,84 s | exit 1; 9,05 s |
| BFF T02 | exit 0; 1,09 s | exit 0; 1,05 s | exit 0; 1,79 s | exit 1; 9,11 s |
| PrintAgent demo | exit 0; 1,14 s | exit 0; 1,61 s | exit 0; 1,96 s | exit 1; 9,30 s |

Los tiempos incluyen CLI, inspección y lectura de eventos; no son sólo tiempo de proceso. Las nueve paradas normales terminaron con código 0. Las tres pruebas de agotamiento terminaron de forma deliberada con código 1, con mensaje fijo de deadline. En los doce escenarios: OOMKilled=false y ningún evento kill signal 9. TERM/INT se observaron según el caso; las señales repetidas fueron 15, 2 y 15.

En los BFF se retuvo una respuesta de catálogo en el fixture para asegurar trabajo en curso; en PrintAgent se inició un POST y se mantuvo incompleto el cuerpo antes de enviar la señal. Después se completó dentro del plazo. Las primeras solicitudes recibieron 200. Una segunda solicitud enviada por la misma conexión durante el drenaje recibió 503; una conexión nueva fue rechazada. No se invocó el upstream para la nueva solicitud BFF ni se creó el segundo job de impresión rechazado.

En las pruebas de agotamiento se dejó pendiente únicamente un GET de catálogo o un cuerpo HTTP incompleto: no había una operación financiera ejecutándose. El POST incompleto no produjo un job aceptado ni un archivo parcial visible. No se ha probado un filesystem bloqueado durante una escritura: el camino fatal no certifica la durabilidad de un trabajo que no haya respondido accepted, ni recuperación ante pérdida física.

### Contratos y persistencia de impresión

- BFF: health y catálogo 200 con cuerpo esperado; origen ajeno 403; el contenido normal no cambió.
- PrintAgent: POST válido 200, replay idéntico 200, cambio incompatible 409 y lectura del job tras reinicio con el mismo resultado.
- El POST aceptado durante el drenaje completó su escritura y se pudo consultar después de reiniciar. La petición rechazada no creó un job.
- Los jobs iniciales persistieron a través de las pruebas. Una lectura readonly del volumen nuevo confirmó cuatro ficheros JSON válidos de las dos rondas, todos simulation=true, physicalConfirmed=false y sin campos personales. No se sobrescribieron jobs para preparar una repetición.
- `kiosk-gateway.test.js`, `thermalReceipt.test.js` y `PrintAgent/tests/contract.test.mjs`: **53/53**, ejecutadas con Node 22.21.1 en contenedor sin red; sólo mocks y validadores, sin impresora.

### Códigos finales

Tras reiniciar los auxiliares después de los casos límite y ejecutar una parada normal del proyecto:

| Contenedor lógico | Estado final | Exit | SIGKILL requerido en parada normal |
|---|---|---:|---|
| bff-t01 | exited | 0 | No |
| bff-t02 | exited | 0 | No |
| print | exited | 0 | No |
| backend fixture | exited | 0 | No |

El cliente temporal y las utilidades finalizaron; no queda ningún proceso del proyecto ejecutándose. Volumen, red, imágenes y evidencias nuevas se conservaron. No se ejecutó down -v ni prune.

## 5. T01: incidencia conocida, no corregida

Estado preservado del expediente original de 2B, aceptado en el diagnóstico 2B.1:

- **Venta PAID.**
- **Pago CAPTURED.**
- **Autorización SETTLED.**
- **Reserva CLOSED.**
- **Comprobante consistente.**
- **Atención todavía ACTIVE.**

Clasificación: **incidencia conocida de finalización/recuperación asociada al harness, pendiente de resolución funcional**. El smoke abortó después del commit financiero y antes de terminar la atención; su recuperación sin sesión no está cubierta para esa forma financiera por el camino de ticket actual. Que el smoke se haya corregido o que el apagado sea graceful no cierra retrospectivamente esa atención.

No se arrancó la base original, reconstruyeron credenciales, finalizaron atenciones originales, hicieron reembolsos o crearon compensaciones. Las huellas de los volúmenes y evidencias anteriores coinciden. Este informe registra el estado documentado; no simula una nueva validación operativa de T01.

## 6. Diferencias frente a 2B.1 y decisión

Corregido ahora: los dos entrypoints ya gestionan señales, drenan trabajo, rechazan nuevas admisiones y acotan un recurso que no termina con exit 1 explícito. Las tres terminaciones normales 137 de 2B.1 quedaron reproducidas como exit 0 en los casos actuales, sin SIGKILL.

Ya corregido y aceptado anteriormente: dato de surtidor en el smoke, fixtures explícitos y protección de información en el paso CI. Sus seis rutas preparadas se mantuvieron intactas en esta intervención.

Pendiente: resolución funcional de T01 y, fuera del alcance probado, cargas que excedan el presupuesto, bloqueos de I/O, restore/pérdida física, todas las operaciones financieras y todas las plataformas. No se repitió toda la integración con PostgreSQL/Redis ni se afirma equivalencia universal: se conserva la evidencia positiva previa y se añade la validación focalizada de los auxiliares.

**Evaluación explícita:** puede proponerse el cierre de Etapa 2B **con T01 documentada como incidencia abierta**, dentro del alcance de integración y empaquetado efectivamente comprobado. No corresponde un cierre sin observaciones ni presentar T01 como resuelta. La aceptación final pertenece al responsable del proyecto; no exige alterar el expediente diagnóstico para conseguir una base aparentemente limpia.

## 7. Archivos exactos propuestos para respaldo

Las seis rutas previamente en staging, sin cambios de contenido en 2B.2:

1. `.github/workflows/ci.yml`
2. `tools/smoke-microservices.cjs`
3. `tools/astra/stage2b1-lab.cjs`
4. `tools/astra/stage2b1-ci-fixture.test.cjs`
5. `Docs/astra/primax-stage2b1-observation-resolution.md`
6. `Docs/astra/evidence/stage2b1/review-summary.json`

Siete rutas nuevas en el paquete de revisión de esta etapa:

7. `Frontend_1_FuelFlow/server/local.js`
8. `PrintAgent/demo-server.mjs`
9. `tools/astra/stage2b2-backend.cjs`
10. `tools/astra/stage2b2-probe.cjs`
11. `tools/astra/stage2b2-shutdown.cjs`
12. `Docs/astra/primax-stage2b2-graceful-shutdown-results.md`
13. `Docs/astra/evidence/stage2b2/review-summary.json`

Los tres helpers nuevos son infraestructura privada de prueba; no crean otro escritor o servicio de negocio. Los nueve originales sin seguimiento de 2B se conservan fuera de este paquete, al igual que todos los archivos privados de configuración, logs y respuestas. La evidencia pública contiene resultados y hashes, no secretos, cookies o datos de perfiles.

Comandos principales: `node tools/astra/stage2b2-shutdown.cjs prepare`, `node tools/astra/stage2b2-shutdown.cjs test`, inspecciones Docker y huellas readonly. La suite de 53 tests se ejecutó mediante `docker run --rm --network none` con fuentes readonly, sin levantar aplicaciones operativas. El Compose ejecutable y los logs se conservan sólo en la cache privada.

Estado Git de entrega: rama/HEAD sin cambios, trece rutas propuestas en staging, nueve originales sin seguimiento y ningún commit nuevo. Se revisó el diff, los secretos conocidos/patrones sensibles y la integridad anterior. Se detiene el trabajo hasta la autorización del commit y, separadamente, de Etapa 3.
