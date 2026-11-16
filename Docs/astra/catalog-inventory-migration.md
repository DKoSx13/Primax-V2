# Migración verificable del inventario sensible

Estado: preparación; inventario legado aún accesible públicamente por compatibilidad
aprobada. No se ha activado el nuevo servicio ni retirado endpoint alguno.

| Consumidor real | Uso | Destino y prueba de aceptación |
|---|---|---|
| FuelFlow `src/js/inventory.js`, invocado por `script.js` al abrir pantalla combustible y recuperar foco | Muestra litros exactos por estación/combustible | Diseñar lectura privada de estación para su identidad técnica, o retirar cifras de UI. Probar dos terminales, sesiones válidas/expiradas/revocadas y ausencia de lecturas cruzadas |
| FuelFlow `server/gateway.js` y adaptador `api/gateway.js` | Proxy de GET inventario sin credenciales; no basta cambiar URL en UI | Migrar también el proxy y su política; eliminar bypass anónimo solo tras migración validada |
| Control `js/app.js` | `/control/inventory`, movimientos, recepción y conciliación, ya privados | Mantener contratos enriquecidos y permisos actuales; no reemplazar por `/control/catalog/inventory` perdiendo activation/availableLiters |
| Prime | Sin uso directo de inventario encontrado; usa beneficios | Regresión de beneficios y flows Prime; no conceder acceso al inventario |
| `tools/v11*-regression.spec.cjs`, `v11_2.spec.cjs`, `v11-smoke.cjs` | Comparación de cifras y estados de carga | Actualizar fixtures/expectativas junto con la nueva pantalla, sin relajar aislamiento |
| `tools/astra/multiterminal.cjs` | Snapshots de inventario vía Prime HTTP antes/después | Cambiar solo la lectura de evidencia a cliente privado autorizado de prueba; no tocar saldos ni pruebas de atomicidad |
| `tools/astra/catalog*.cjs` y contratos FuelFlow | Paridad y routing del legado | Conservar prueba del contrato durante transición; tras autorización exigir 401/403 sin credenciales |

La búsqueda fue estática en este checkout: no demuestra ausencia de consumidores
externos o versiones desplegadas. Inventariar esos consumidores con los responsables
antes de fijar una fecha de retirada; no se inventó un plazo ni cabecera Sunset.

Puertas de salida, en orden:
1. Aprobar destino de FuelFlow (identidad técnica y visualización). Documentar
   campos, permisos existentes aplicables y contrato de errores. No usar permisos
   administrativos para resolver una pantalla de terminal.
2. Añadir destino privado y pruebas con AuthCore/credenciales reales sintéticas;
   validar filtrado antes de enviar respuesta, revocación y manipulación de parámetros.
3. Migrar pantalla, proxy y herramientas juntos. Probar desktop/móvil, carga/error,
   cambio de combustible, foco, dos estaciones y ausencia de lectura anónima del
   nuevo destino. Control conserva su API y contratos financieros.
4. En laboratorio nuevo: comparar respuestas autorizadas, ejecutar regresiones
   FuelFlow/Prime/Control, Compose privado, PostgreSQL SELECT, caída/reinicio y
   health con Print/OCR. Guardar evidencia sin secretos ni cantidades reales.
5. Confirmar todos los consumidores desplegados y aprobar explícitamente retirar
   exposición pública. Solo entonces cambiar el legado a autenticación o retirar
   campos sensibles mediante una transición de contrato acordada. Verificar URL
   directa, gateway, versiones antiguas, cachés y que no queden alias públicos.
6. Retirar la excepción de exposición de `catalog-data-contracts.json` y modificar
   su prueba: anónimo/miembro sin permiso debe obtener 401/403, no cantidades.
   Una reversión posterior no debe reabrir silenciosamente el acceso público.

Pruebas negativas obligatorias: ausencia/alteración de firma, sesión expirada y
revocada, estación ajena, query repetida/inválida, headers de estación/rol falsificados,
clave interna enviada por cliente y acceso directo al servicio. No desactivar el
legado antes de superar estas puertas y recibir autorización de retirada.
