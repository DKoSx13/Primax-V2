# Auditoría inicial Astra — 2026-11-10

Punto de partida: `09e2e4c`, rama `feat/astra-hexagonal-microservices`. Informe parcial; no certifica la misión integral.

## PR consultados en GitHub

Todos abiertos, draft y mergeable con su propia base al consultar. Esto no garantiza integración con QA. Las pruebas descritas por sus autores son históricas, no verificaciones nuevas por PR.

| PR | Propósito | Base | Estado frente a QA | Faltantes / acción | Conflictos / pruebas |
|---|---|---|---|---|---|
|9|Logo Prime|main|Divergente|Revisar patch visual; no importar rama completa|Conflicto con QA no evaluado; pruebas históricas|
|10|style(frontend3): usar logos PNG y variante V2 en Control|main|Divergente|Comparar cambios visuales individualmente; diferencias de árbol incluyen evoluciones posteriores|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|11|feat(receipts): persistir correlativos y vincular comprobantes con operaciones|main|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|12|fix(frontend1): eliminar la activación administrativa del kiosco|review/persistent-receipt-numbering-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|13|fix(frontend1): recuperar sesiones abandonadas de forma segura|review/kiosk-availability-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|14|fix(frontend1): conservar datos y finalizar con o sin impresión|review/terminal-session-recovery-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|15|style(frontend1): centrar los métodos de pago de prepago|review/receipt-form-finalization-20261107|Divergente|Comparar cambios visuales individualmente; diferencias de árbol incluyen evoluciones posteriores|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|16|refactor(deploy): desplegar microservicios y demo local con Compose|review/receipt-form-finalization-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|17|docs: documentar arquitectura, despliegue y resultados verificados|review/microservices-compose-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|

## Verificación ejecutada

- FuelFlow: reprodujeron 3 fallos (165 aprobadas de 168). Fixture desactualizado: faltaban `terminalService.me` y `confirmedTerminal`. El código real consulta identidad antes de imprimir; no se retiró esa protección.
- Fixture actualizado y cuatro regresiones añadidas: terminal diferente, surtidor inválido, consulta indisponible y T02 con surtidor 02. Resultado: 172/172.
- Prime: 31/31; Control: 36/36. PrintAgent: 56 aprobadas, 1 omitida.
- Build estático de los tres frontends aprobado.
- Evidencias completas en `evidence/*-tests.log`.
- CI remoto 42661448994: falló Frontend and print contracts; Backend y PostgreSQL aprobaron; OCR and public flows omitido. No hay ejecución remota nueva.

## Límites y próximos pasos obligatorios

No se ha completado auditoría funcional E2E, accesibilidad, baselines, responsive ni aislamiento entre usuarios. No se afirma estabilidad financiera. Backend no tiene node_modules local. Los scripts Playwright existentes dependen de Prime/node_modules y algunos reutilizan servidores: antes de ejecutarlos debe garantizarse QA exclusiva, pues localhost por sí solo no garantiza aislamiento de datos.

No se avanzó a extracción arquitectónica: falta superar la estabilización e integración requerida. Persisten cuatro procesos con proyecto y persistencia compartidos; no son cuatro proyectos independientes. Quedan pendientes puertos/adaptadores, separación compilable, Docker QA exclusivo, evaluación Neon, CI E2E y guías de despliegue.

Estrategia: conservar historial QA, comparar por patch los PR divergentes #9/#10/#15, validar el conjunto y preparar PR consolidado hacia main. No fusionar automáticamente la cadena de PR ya incorporados.

## Protección del laboratorio

No se ejecutaron operaciones de escritura Docker, migraciones, seeds, conexiones financieras ni hardware. Solo se listaron contenedores. No se modificó el directorio de feria. Esto documenta las acciones de esta sesión; no constituye un checksum o auditoría independiente de sus bases.

## Reproducción

```bash
for app in Frontend_1_FuelFlow Frontend_2_PrimaxPrime Frontend_3_PrimaxControl PrintAgent; do
  npm test --prefix "$app" || exit 1
done
for app in Frontend_1_FuelFlow Frontend_2_PrimaxPrime Frontend_3_PrimaxControl; do
  npm run build --prefix "$app" || exit 1
done
```
