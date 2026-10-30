# Convenciones de código Primax V2

Guía para código nuevo y cambios acotados. No ordena renombrar masivamente el código heredado; primero se registra la inconsistencia y se evalúa en trabajo futuro.

## Convención esperada

- **camelCase:** variables, parámetros, funciones, métodos y propiedades (`normalizePlate`, `stationId`).
- **PascalCase:** clases, tipos, interfaces, enums, componentes UI y constructores (`PaymentsService`, `StationSummary`). En enums, los miembros siguen el estilo consistente del lenguaje/proyecto; constantes de dominio globales pueden ir en `UPPER_SNAKE_CASE`.
- **UPPER_SNAKE_CASE:** constantes globales inmutables y claves simbólicas cuando el stack actual las usa (`MAX_RETRIES`, `PAYMENT_STATUS`). No convertir automáticamente todos los valores de enum ni propiedades de transporte.
- **kebab-case:** nombres de archivos y rutas URL cuando la convención del componente lo utiliza (`payment-provider.spec.ts`, `/inventory-reconciliation`). Mantener extensiones/patrones del runner: Jest `.spec.ts`, Node `.test.js`/`.test.mjs`, Playwright `.spec.cjs`.
- Respetar la convención local del componente y no cambiar contratos HTTP, columnas, variables de entorno o payloads para uniformar nombres sin revisión de compatibilidad.

## Inconsistencias observadas en inventario

- En `Backend/src` coexisten pruebas `.spec.ts`, mientras Frontends/PrintAgent usan `.test.js` o `.test.mjs`; esto es una diferencia de runner/convención, no necesariamente un defecto.
- Primax Prime mezcla `.test.js` de Node y `.spec.cjs` de Playwright; los sufijos corresponden a dos runners diferentes.
- Código histórico contiene símbolos de dominio en mayúsculas y nombres/estados en español e inglés (`SALDO_PRIME`, `PENDIENTE`, `operationId`, `membership-number`). Nombres públicos/API y valores persistidos pueden ser contratos, por lo que no se recomienda renombrarlos en lote.
- La existencia de archivos kebab-case junto a archivos descriptivos mixtos no basta por sí sola para concluir incumplimiento; los nombres deben evaluarse al añadir o modificar cada módulo.

## Candidatos para corrección futura

1. Acordar una convención por lenguaje para nombres de archivos nuevos (TypeScript, JavaScript, Python) y documentar excepciones de runners.
2. Revisar nuevos símbolos en inglés/español al tocar el módulo; no renombrar APIs, schema ni estados persistidos sin migración/compatibilidad aprobada.
3. Asegurar que constantes realmente globales sean constantes y sigan un estilo uniforme dentro del componente.
4. Revisar rutas nuevas para kebab-case y mantener tests junto a su runner/componente.

No se identificó una lista de errores concretos que justifique refactor masivo a partir de una inspección estática de nombres.
