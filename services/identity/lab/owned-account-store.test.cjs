const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { OwnedAccountStore } = require("./owned-account-store.cjs");
test("private adapter requires opt-in and rejects foreign financial/operational fields before SQL", async () => {
  assert.throws(() => new OwnedAccountStore({}, {}));
  const store = new OwnedAccountStore(
    {},
    { synthetic: true, assertIdentity: () => {} },
  );
  for (const field of [
    "balance",
    "welcomeAvailable",
    "status",
    "stationId",
    "terminalId",
    "permissions",
  ])
    await assert.rejects(
      store.provisionSyntheticIdentity({
        name: "Synthetic",
        email: "synthetic@example.invalid",
        passwordHash: "not-used",
        [field]: 1,
      }),
      /OWNERSHIP_BOUNDARY/,
    );
});
test("existing document invariant is delegated before creating an identity", async () => {
  let transactions = 0;
  const store = new OwnedAccountStore(
    {
      $transaction: () => {
        transactions++;
      },
    },
    {
      synthetic: true,
      assertIdentity: (value) => {
        if (value.dni && value.passport) throw Error("existing-document-rule");
      },
    },
  );
  await assert.rejects(
    store.provisionSyntheticIdentity({
      name: "Synthetic",
      email: "synthetic@example.invalid",
      passwordHash: "unused",
      dni: "12345678",
      passport: "TEST001",
    }),
    /existing-document-rule/,
  );
  assert.equal(transactions, 0);
});
