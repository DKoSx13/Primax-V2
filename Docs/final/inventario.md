# Inventario de Debian y GitHub

Consulta de las 25 ramas mediante la API de GitHub el 27-11-2026. Los conteos usan `git rev-list --left-right --count`. La última columna cuenta los commits exclusivos de la rama respecto al candidato.

| Rama remota | SHA verificado | Solo main / solo rama | Solo candidato / solo rama |
|---|---|---|---|
| deployment/v2-staging | `b44bc175799f4a53523f8161283ac3012a322e8b` | 25 / 0 | 89 / 0 |
| feat/astra-hexagonal-microservices | `b99b995fa9f0527a0e2094d4f1c9c3e638548c83` | 0 / 21 | 43 / 0 |
| feature/v2-01-role-workflow | `37147333bc7805d9d39e8fad80c9308b64aacf11` | 27 / 0 | 91 / 0 |
| feature/v2-02-assistance | `03a731e7a093b08592b2517beaf280865174c76b` | 24 / 0 | 88 / 0 |
| feature/v2-03-payments | `1b5cae834aa4fc2282689ad2f3a81070555c9faf` | 21 / 0 | 85 / 0 |
| feature/v2-04-receipts | `98f0cd73cca073a3860c0f81348471f00a320281` | 25 / 0 | 89 / 0 |
| feature/v2-05-prime | `4d74f93a140da682a733913f57fafeb087da1ef3` | 15 / 0 | 79 / 0 |
| feria/estabilizacion-local-20261120 | `846a0636037306e850c6beac48d67a1de2bd32f5` | 0 / 64 | 0 / 0 |
| handoff/astra-identity-catalog-2026-11 | `b4594ef80bd923a449fc923b01159e2d4aeb3deb` | 0 / 22 | 42 / 0 |
| handoff/astra-lot5-20261120 | `c4aea333ae3dd8079a529e941f0adc1fecb556d0` | 0 / 63 | 1 / 0 |
| main | `58a2206d295d4f20c15495da6c1a8ec36572d4a5` | 0 / 0 | 64 / 0 |
| qa/feria-integration | `09e2e4cf38a868fd955236ae076765ae3d5281e6` | 0 / 11 | 53 / 0 |
| qa/stabilization-v2 | `0d8d20459a624c0bc19a777d18c46718377e3817` | 0 / 1 | 63 / 0 |
| quality/v2-sonarqube | `ba59e1e61846d0d63771532fba5c2e28cf6e85a0` | 25 / 0 | 89 / 0 |
| review/architecture-validation-docs-20261107 | `284504c2b6b8bdf1a3f117ebc8c4818b9c84cf9f` | 0 / 7 | 57 / 0 |
| review/control-logo-v2-20261107 | `1a146baeee22d9b84238610673d8898603a769fa` | 0 / 1 | 64 / 1 |
| review/kiosk-availability-20261107 | `36616b083d75610bdcb86edbb82455c21e91bf90` | 0 / 2 | 62 / 0 |
| review/microservices-compose-20261107 | `b609273bd0db07859b6cad0eca34fc59d91f2a89` | 0 / 5 | 59 / 0 |
| review/persistent-receipt-numbering-20261107 | `4d11441c2d064d5c88042d0513f60158c6f9d71f` | 0 / 1 | 63 / 0 |
| review/prepaid-payment-layout-stacked-20261107 | `53052992615ab98bac101c90fcf77beb3886ca54` | 0 / 5 | 60 / 1 |
| review/prime-logo-png-20261107 | `fbc28432bf80b4b18e752c2da4ebf9c789f1dd69` | 0 / 1 | 64 / 1 |
| review/receipt-form-finalization-20261107 | `471a060d53f813eb9cef9a5d05a509588a57ae0d` | 0 / 4 | 60 / 0 |
| review/terminal-session-recovery-20261107 | `fc473bc0f63f047d951c71be895b3b47d179d9b6` | 0 / 3 | 61 / 0 |
| validation/v2-final | `453de22446307127826aec28d393bf24d57886cd` | 9 / 0 | 73 / 0 |
| validation/v2-integration | `079459581bfba96c946d658abbc264bcf2f948d2` | 26 / 8 | 90 / 8 |

## Copias locales

- `/home/primax/Proyectos/Primax-V2` · `qa/stabilization-v2` · `0d8d20459a624c0bc19a777d18c46718377e3817` · 0 entradas pendientes. Comparación con upstream local (solo HEAD / solo upstream) `0 / 0`.
- `/home/primax/Proyectos/Primax-V2-astra` · `handoff/astra-identity-catalog-2026-11` · `b4594ef80bd923a449fc923b01159e2d4aeb3deb` · 55 entradas pendientes. Comparación con upstream local (solo HEAD / solo upstream) `0 / 0`.
- `/home/primax/Proyectos/Primax-V2-astra-lot5` · `feria/estabilizacion-local-20261120` · `846a0636037306e850c6beac48d67a1de2bd32f5` · 14 entradas pendientes. Comparación con upstream local (solo HEAD / solo upstream) `0 / 0`.

```text
M Backend/src/auth/auth.controller.ts
 M Backend/src/auth/auth.service.ts
 M Backend/src/users/users.repository.ts
 M Backend/src/users/users.service.ts
 M Docs/feria-prime-ngrok.md
 M Frontend_2_PrimaxPrime/js/app.js
 M Frontend_2_PrimaxPrime/js/passwordPolicy.js
 M Frontend_2_PrimaxPrime/js/services/authService.js
 M Frontend_2_PrimaxPrime/tests/identity-recovery.spec.cjs
 M Frontend_2_PrimaxPrime/tests/password-policy.test.js
 M Frontend_2_PrimaxPrime/tests/register.spec.cjs
 M Frontend_2_PrimaxPrime/tests/register.test.js
 M tools/prime-demo-proxy.cjs
?? tools/prime-demo-proxy.test.cjs
```

- `/home/primax/Proyectos/Primax-V2-feria` · `qa/feria-integration` · `09e2e4cf38a868fd955236ae076765ae3d5281e6` · 0 entradas pendientes. Comparación con upstream local (solo HEAD / solo upstream) `0 / 0`.
- `/home/primax/Proyectos/Proyecto` · `main` · `5ffdde85d9aab1e66c37a0aebad21210cf686937` · 3 entradas pendientes. Comparación con upstream local (solo HEAD / solo upstream) `0 / 0`.
- `/home/primax/Proyectos/Proyecto_backup` · `main` · `6cf6e2cc1711da1ef810a607b330c0e74493cf3e` · 0 entradas pendientes. Comparación con upstream local (solo HEAD / solo upstream) `1 / 11`.

## Docker de feria al iniciar la misión

Nombres, etiquetas y volúmenes. Se omiten configuraciones de entorno y contenido de los datos.

```text
primax-astra-original-frontend1-1 primax-fuelflow-t01:physical-20261121T214008Z running
primax-astra-original-identity-service-1 primax-astra-original-identity:lot4 running
primax-astra-original-plate-recognition-1 primax-astra-original-plate-recognition running
primax-feria-membership-ocr-check-20261121 primax-feria-lab-20261121-plate-recognition:latest exited
primax-astra-original-frontend2-1 primax-astra-original-frontend2 running
primax-astra-original-administration-service-1 primax-astra-original-administration:lot4 running
primax-astra-original-fuelflow-t02-1 primax-astra-original-fuelflow-t02 running
primax-astra-original-frontend3-1 primax-astra-original-frontend3 running
primax-feria-accept-20261121-fuelflow-t02-1 primax-feria-lab-20261121-fuelflow-t02:latest exited
primax-feria-accept-20261121-frontend1-1 primax-feria-lab-20261121-frontend1:latest exited
primax-feria-accept-20261121-frontend2-1 primax-feria-lab-20261121-frontend2:latest exited
primax-feria-accept-20261121-frontend3-1 primax-feria-lab-20261121-frontend3:latest exited
primax-feria-accept-20261121-fuelflow-gateway-t02-1 primax-feria-lab-20261121-fuelflow-gateway-t02:latest exited
primax-feria-accept-20261121-fuelflow-gateway-1 primax-feria-lab-20261121-fuelflow-gateway:latest exited
primax-feria-accept-20261121-backend-1 primax-feria-lab-20261121-gateway:lot4 exited
primax-feria-accept-20261121-commerce-service-1 primax-feria-lab-20261121-commerce:lot4 exited
primax-feria-accept-20261121-identity-service-1 primax-feria-lab-20261121-identity:lot4 exited
primax-feria-accept-20261121-administration-service-1 primax-feria-lab-20261121-administration:lot4 exited
primax-feria-accept-20261121-catalog-service-1 primax-feria-lab-20261121-catalog:lot4 exited
primax-feria-accept-20261121-bootstrap-1 primax-feria-lab-20261121-init:lot4 exited
primax-feria-accept-20261121-postgres-1 postgres:17.6-bookworm exited
primax-feria-accept-20261121-redis-1 redis:7.4-alpine exited
primax-feria-accept-20261121-print-service-1 primax-feria-lab-20261121-print-service:latest exited
primax-feria-accept-20261121-plate-recognition-1 primax-feria-lab-20261121-plate-recognition:latest exited
primax-feria-accept-20261121-volume-guard-1 primax-feria-lab-20261121-volume-guard:lot4 exited
primax-feria-lab-ocr-final-20261121 primax-feria-lab-20261121-plate-recognition exited
primax-feria-lab-prime-final-20261121 primax-feria-lab-20261121-frontend2 exited
primax-feria-lab-20261121-fuelflow-t02-1 ac7795097bd2 exited
primax-feria-lab-20261121-frontend1-1 cc90bd31028f exited
primax-feria-lab-20261121-frontend2-1 9769a7145fd8 exited
primax-feria-lab-20261121-frontend3-1 primax-feria-lab-20261121-frontend3 exited
primax-feria-lab-20261121-fuelflow-gateway-t02-1 primax-feria-lab-20261121-fuelflow-gateway-t02 exited
primax-feria-lab-20261121-fuelflow-gateway-1 primax-feria-lab-20261121-fuelflow-gateway exited
primax-feria-lab-20261121-backend-1 primax-feria-lab-20261121-gateway:lot4 exited
primax-feria-lab-20261121-identity-service-1 primax-feria-lab-20261121-identity:lot4 exited
primax-feria-lab-20261121-administration-service-1 primax-feria-lab-20261121-administration:lot4 exited
primax-feria-lab-20261121-commerce-service-1 primax-feria-lab-20261121-commerce:lot4 exited
primax-feria-lab-20261121-catalog-service-1 primax-feria-lab-20261121-catalog:lot4 exited
primax-feria-lab-20261121-bootstrap-1 primax-feria-lab-20261121-init:lot4 exited
primax-feria-lab-20261121-print-service-1 primax-feria-lab-20261121-print-service exited
primax-feria-lab-20261121-postgres-1 postgres:17.6-bookworm exited
primax-feria-lab-20261121-redis-1 redis:7.4-alpine exited
primax-feria-lab-20261121-plate-recognition-1 6132763e76e9 exited
primax-feria-lab-20261121-volume-guard-1 primax-feria-lab-20261121-volume-guard:lot4 exited
primax-feria-ocr-serial-20261121 6132763e76e9 exited
primax-feria-ocr-tests-20261121 6132763e76e9 exited
primax-astra-original-fuelflow-gateway-t02-1 primax-astra-original-fuelflow-gateway-t02 running
primax-astra-original-fuelflow-gateway-1 primax-astra-original-fuelflow-gateway running
primax-astra-original-backend-1 primax-astra-original-gateway:lot4 running
primax-astra-original-commerce-service-1 primax-astra-original-commerce:lot4 running
primax-astra-original-catalog-service-1 primax-astra-original-catalog:lot4 running
primax-astra-original-bootstrap-1 primax-astra-original-init:lot4 exited
primax-astra-original-postgres-1 postgres:17.6-bookworm running
primax-astra-original-redis-1 redis:7.4-alpine running
primax-astra-original-print-service-1 primax-astra-original-print-service running
primax-astra-original-volume-guard-1 primax-astra-original-volume-guard:lot4 exited
```

```text
primax-fuelflow-t01:physical-20261121T214008Z 54ea5b9bd324
primax-astra-original-identity:lot4 2fa8188262d0
primax-astra-original-plate-recognition:latest c8249cb7fb66
primax-astra-original-frontend2:latest 63f0ba3592cc
primax-astra-original-frontend3:latest 3175d077e5e5
primax-astra-original-fuelflow-t02:latest 497a0cef5c2a
primax-astra-original-frontend1:latest 83f11e3c95e1
primax-fuelflow-t01:rollback-20261121T214008Z 83f11e3c95e1
primax-feria-lab-20261121-frontend1:latest 278ca42e6591
primax-feria-lab-20261121-fuelflow-t02:latest 7a5e49049b3d
primax-feria-lab-20261121-plate-recognition:latest e6ab241c7f00
primax-feria-lab-20261121-frontend2:latest bbc070d34877
primax-feria-lab-20261121-identity:lot4 d868d492615a
primax-feria-lab-20261121-frontend3:latest f576886b3d84
primax-feria-lab-20261121-commerce:lot4 60ae7a0cfcc1
primax-feria-lab-20261121-catalog:lot4 b15fd3491bc8
primax-feria-lab-20261121-administration:lot4 a74b63c6bf40
primax-astra-original-administration:lot4 4af84cf8242a
primax-feria-lab-20261121-init:lot4 64b07f0057c4
primax-feria-lab-20261121-volume-guard:lot4 252ab3b1c691
primax-feria-rollback/frontend1:20261121-024210 d43428900b70
primax-astra-original-commerce:lot4 d9f4c9883ef2
primax-astra-original-catalog:lot4 c4ea6929c890
primax-feria-rollback/identity-service:20261121-024210 dc649f29c148
primax-feria-rollback/administration-service:20261121-024210 ccf6146e6204
primax-astra-original-volume-guard:lot4 29ec9c7fa160
primax-astra-original-init:lot4 6d50e7124a09
primax-feria-rollback/plate-recognition:20261121-024210 4caa6102fab6
primax-feria-rollback/frontend2:20261121-024210 fa32f7d9bffe
primax-feria-rollback/frontend3:20261121-024210 792ad793505a
primax-feria-rollback/fuelflow-t02:20261121-024210 e95a46cb0c01
primax-astra-original-print-service:latest 59c8b620a843
primax-feria-lab-20261121-print-service:latest ef38af511a5a
primax-astra-original-fuelflow-gateway:latest d26f77d75e73
primax-feria-lab-20261121-fuelflow-gateway:latest 84eb912e544a
primax-feria-lab-20261121-fuelflow-gateway-t02:latest cd9816d79e3d
primax-astra-original-fuelflow-gateway-t02:latest d404f9013492
primax-astra-original-gateway:lot4 1009985c2390
primax-feria-lab-20261121-gateway:lot4 e20924674102
redis:7.4-alpine 7f7d30b7fdd0
postgres:17.6-bookworm f3bd19c606e4
```

```text
bridge
host
none
primax-astra-original_data
primax-astra-original_web
primax-feria-accept-20261121_data
primax-feria-accept-20261121_web
primax-feria-lab-20261121_data
primax-feria-lab-20261121_web
```

```text
primax-astra-original_bootstrap_state
primax-astra-original_postgres_data
primax-astra-original_print_data
primax-astra-original_redis_data
primax-feria-accept-20261121_bootstrap_state
primax-feria-accept-20261121_postgres_data
primax-feria-accept-20261121_print_data
primax-feria-accept-20261121_redis_data
primax-feria-lab-20261121_bootstrap_state
primax-feria-lab-20261121_postgres_data
primax-feria-lab-20261121_print_data
primax-feria-lab-20261121_redis_data
```

