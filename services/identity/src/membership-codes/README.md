# Membership codes — A.4 phases 0/1

Pure opt-in TypeScript core, deliberately disconnected from runtime, HTTP,
registration and persistence. See `Docs/astra/identity-a4-invariants-and-core.md`
from the repository root for observed contracts, pending decisions and limitations.

`core.ts` defines positive-bigint formatting, canonical syntax, explicit code
normalization, a read-only lookup port, canonical-first resolution and the separate
legacy member-specific alias comparison. No function allocates an ordinal,
authorizes an actor, checks Vehicle ownership or changes financial eligibility.

Normalization has no default. Callers must select `exact` or `trim-uppercase`.
Aliases are opaque historical codes within the existing transport shape; they are
not restricted to generated canonical syntax. Cross-namespace collisions remain
an open business/storage decision, documented by a synthetic regression case.
Adapter errors propagate. Two reads do not imply transaction/snapshot consistency.

Isolated source tests, verified with Node v24.22.1, from the repository root:

```bash
node --experimental-strip-types --test services/identity/test/membership-codes.test.cjs
```

This uses Node's native TypeScript stripping and in-memory fixtures only. It does
not run TypeScript type checking, build, Prisma generation, migrations, Docker or
the full test suite. Normal compiled-suite execution loads `dist/membership-codes/core.js`.
No package scripts or dependencies were changed. Phase 2 is not implemented.
