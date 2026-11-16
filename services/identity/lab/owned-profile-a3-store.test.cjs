const { test } = require("node:test");
const assert = require("node:assert/strict");
const { OwnedProfileA3Store } = require("./owned-profile-a3-store.cjs");
test("A3 rejects foreign fields and identifiers before any persistence access", async () => {
  const db = new Proxy(
    {},
    {
      get() {
        throw Error("unexpected SQL");
      },
    },
  );
  const store = new OwnedProfileA3Store(db, {
    synthetic: true,
    assertIdentity: () => {},
    validateProfile: async (p) => p,
  });
  for (const field of [
    "accountId",
    "balance",
    "status",
    "welcomeAvailable",
    "number",
    "vehicleId",
    "permissions",
  ]) {
    await assert.rejects(
      store.updateSyntheticProfile("synthetic", { [field]: "other" }),
      /OWNERSHIP_BOUNDARY/,
    );
  }
});
test("A3 validates document exclusivity against stored profile before writing", async () => {
  let writes = 0;
  const db = {
    $transaction: async (f) =>
      f({
        identityProfile: {
          findUniqueOrThrow: async () => ({ passport: "TEST001", dni: null }),
          update: async () => {
            writes++;
          },
        },
      }),
  };
  const store = new OwnedProfileA3Store(db, {
    synthetic: true,
    validateProfile: async (p) => p,
    assertIdentity: (p) => {
      if (p.dni && p.passport) throw Error("existing-document-rule");
    },
  });
  await assert.rejects(
    store.updateSyntheticProfile("synthetic", { dni: "12345678" }),
    /existing-document-rule/,
  );
  assert.equal(writes, 0);
});
