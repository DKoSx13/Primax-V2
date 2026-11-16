const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createContractLab } = require("./identity-data-contract-lab.cjs");

test("V1 fixtures require service authentication and reject arbitrary operations", async () => {
  const lab = await createContractLab("synthetic-test-key");
  const call = (operation, body = {}, key = "synthetic-test-key") =>
    fetch(lab.origin + "/identity-compat/" + operation, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-identity-compat-key": key,
        connection: "close",
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await call("finance/me", {}, "wrong")).status, 401);
    assert.equal((await call("prisma/query", { sql: "SELECT 1" })).status, 404);
    assert.equal((await call("finance/pay", { amount: "1.00" })).status, 404);
    assert.equal(
      (
        await call("finance/rewards", {
          userId: "11111111-1111-4111-8111-111111111111",
          query: { page: 1, limit: 1000 },
        })
      ).status,
      400,
    );
  } finally {
    await lab.stop();
  }
});

test("fixtures preserve response data and do not invent missing financial state", async () => {
  const lab = await createContractLab("synthetic-test-key");
  const userId = "11111111-1111-4111-8111-111111111111";
  const call = (operation) =>
    fetch(lab.origin + "/identity-compat/" + operation, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-identity-compat-key": "synthetic-test-key",
        connection: "close",
      },
      body: JSON.stringify({ userId }),
    });
  try {
    assert.equal((await call("finance/me")).status, 404);
    const expected = {
      id: "fixture",
      balance: "12.34",
      reserved: "5.67",
      total: "18.01",
      points: 9,
    };
    lab.memberships.set(userId, expected);
    const response = await call("finance/me");
    assert.equal(response.headers.get("x-identity-contract-version"), "1");
    assert.deepEqual(await response.json(), expected);
    assert.deepEqual(lab.memberships.get(userId), expected);
    assert.deepEqual(lab.calls, ["finance/me", "finance/me"]);
  } finally {
    await lab.stop();
  }
});
