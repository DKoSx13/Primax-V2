# Identity: núcleo extraíble

Dominio (`domain.ts`), puertos (`ports.ts`), casos de uso (`identity.ts`) y adaptador
sintético (`memory.ts`). No importa frameworks, persistencia ni módulos del Backend.
Los adaptadores de compatibilidad están en `../identity-adapters`.

Desde la raíz del repositorio:

```bash
npm run test:identity-core --prefix Backend
```

Compila exclusivamente este núcleo y ejecuta pruebas Node sin cargar Nest/Prisma.
La instalación de TypeScript de este directorio se toma del Backend. El proyecto
con runtime y clientes propios está ahora en `services/identity`; no se registra
su composición en módulos activos. El puerto Sessions
presupone verificación previa de firma/CSRF y no sustituye KioskService.

Inventario, contrato de actor, alcance de pruebas y bloqueos:
`Docs/astra/mision5-identity-core.md` en la raíz del repositorio.

Laboratorio PostgreSQL/Redis/SMTP STARTTLS reales, completamente sintético:

```bash
npm run test:identity-lab --prefix Backend
```

Requiere Docker/OpenSSL y Prisma Client generado. Crea recursos nuevos con tmpfs,
sin bases ni credenciales existentes. Incluye pruebas de cuentas/perfil/grants,
sesiones Redis y contratos HTTP legados. La evidencia actual verifica reconexión
automática de KioskStore tras desconexión y dos reinicios de Redis, sin reiniciar
Identity. La composición optativa conserva las 27 rutas/métodos del Identity
actual; aún requiere módulos y esquema del Backend y no certifica despliegue autónomo.
