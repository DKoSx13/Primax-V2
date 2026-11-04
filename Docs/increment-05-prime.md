# Incremento 05 — Numeración pública PRIME y compatibilidad

Spec rectora: `Specs/06-prime-membership-numbering.md`. Rama `feature/v2-05-prime` desde main 7cde52c. Mantiene UUID como PK y código público UNIQUE, con contador BIGINT PostgreSQL existente mediante UPDATE value=value+1 RETURNING value dentro de la transacción de alta. No utiliza SELECT último+1.

## Análisis y migración

La baseline genera `PRIM-001`, `PRIM-001A` y conserva ejemplos antiguos `PRIME-0001`/`PRIM001`; la migración histórica solo reconcilia dos usuarios conocidos. Se añade una migración V2 independiente sin editar SQL histórico. No se consultaron ni modificaron datos cloud para este análisis.

`20261030050000_v2_prime_numbering` bloquea tablas de membresía/contador durante la migración, preserva códigos V2 ya canónicos y reserva el high-water mark de los ordinales canónicos/convertibles. Convierte `PRIM-NNN<letras>` a `PRIME-<letras>NNN`. Si hay colisión o formato no interpretable, asigna con UPDATE del contador atómico. Conserva el código anterior en `MembershipCodeAlias` vinculado al mismo UUID. Una colisión nunca combina usuarios ni reemplaza sus relaciones. El código canónico existente tiene prioridad sobre un legado que quiera ocuparlo. La migración es transaccional y falla ante capacidad numérica excedida.

Todos los FK de usuarios, vehículos, operaciones y finanzas continúan apuntando al mismo ID. Los importes y requestHash financieros no se reescriben. Backend valida alias contra el UUID de la membresía vinculada a la placa: un alias ajeno no autoriza una operación. Consultas de vehículo, validación de placa, bienvenida, autorización y cierre de transacción admiten los alias. FuelFlow conserva comparación de códigos y admite solo alias devueltos por Backend. Seed busca por userId y usa el allocator únicamente para una membresía nueva, sin alterar membresía/saldo al repetirse.

## Matriz SDD

| Requisito | Implementación | Tests | Resultado |
| --- | --- | --- | --- |
| Ejemplos 1/999/1000/1998/1999 y Z/AA/AZ/BA | `users/membership-number.ts` | `membership-number.spec.ts` | 53000 códigos únicos y bien formados; límites aprobados |
| Secuencia interna PostgreSQL atómica, UNIQUE y UUID independiente | contador existente; `UsersRepository` | `test/v2-prime.e2e-spec.ts`, registration E2E actualizado | Altas concurrentes en ambos límites, sin duplicados |
| Migración segura y colisiones | SQL V2 y `MembershipCodeAlias` | E2E ejecuta SQL exacto en esquema local aislado | Conserva IDs, relación de vehículo, balance y alias; canónico existente no se sobrescribe |
| Compatibilidad y alcance del alias | `membership-code.ts`, pagos/transacciones/vehículos/alerts; FuelFlow `membershipCode.js` | unit de alias ajeno y cliente; E2E de migración | Solo alias del mismo UUID aceptado |
| Prime muestra formato nuevo, vehículos/cuenta preservados | ejemplos/fixtures Prime y seed | Prime services/tests existentes | 27 pruebas y build correcto |

Validación: Backend 24 suites/194 pruebas y build; E2E nuevo 2 pruebas de PostgreSQL real (incluye asignación concurrente y migración con conflictos). FuelFlow 138 pruebas y build; Prime 27 y build. Ejecución exclusivamente local, sin Neon ni historial V12.1 modificado.

## Operación y riesgos

Antes de ejecutar en staging V2: backup, inventario de códigos y ensayo de restauración; desplegar Backend compatible con alias y migración juntos, evitando convivir con un emisor antiguo que genere PRIM. La tabla de alias se conserva; rollback del código público requeriría una migración explícita que mantenga UNIQUE, no restaurar a ciegas registros financieros. El contador puede tener huecos por reconciliación/colisiones, pero no repite un código emitido. SDD conduce este incremento; SDLC conserva despliegue/mantenimiento como etapas posteriores con validación de datos.
