// Private A.4 adapter. No connection strings, model clients, HTTP or runtime imports.
const { createHash } = require("node:crypto");
const POLICY = "A4_UNIFIED_EXPLICIT_V1";
const MAX = 9223372036854775807n;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = (code) => Object.assign(new Error(code), { code });

function sqlState(error) {
  if (error?.code === "P2034") return "40001";
  return error?.meta?.code ?? error?.code;
}

function prepare(command, core) {
  const allowed = ["operationId", "membershipId", "accountId", "aliases", "normalization"];
  if (!command || typeof command !== "object" || Object.keys(command).some((k) => !allowed.includes(k)))
    throw fail("A4_INVALID_COMMAND");
  for (const key of ["operationId", "membershipId", "accountId"])
    if (typeof command[key] !== "string" || !uuid.test(command[key])) throw fail("A4_INVALID_UUID");
  if (!Array.isArray(command.aliases) || command.aliases.length > 100)
    throw fail("A4_INVALID_ALIASES");
  // Validate the mode even for an empty alias array; never silently choose one.
  core.normalizeMembershipCode("PRIME-001", command.normalization);
  const aliases = command.aliases.map((raw) => {
    const code = core.normalizeMembershipCode(raw, command.normalization);
    if (code === null) throw fail("A4_INVALID_ALIAS");
    return code;
  });
  if (new Set(aliases).size !== aliases.length) throw fail("A4_DUPLICATE_ALIAS");
  // Preserve raw input/order in retry bindings; do not normalize away a changed request.
  const digest = createHash("sha256").update(JSON.stringify([
    1, POLICY, command.operationId, command.membershipId, command.accountId,
    command.normalization, command.aliases,
  ])).digest("hex");
  return { ...command, aliases, digest };
}

function publicReceipt(row) {
  return {
    operationId: row.operationId, membershipId: row.membershipId,
    canonicalCode: row.canonicalCode, allocatedOrdinal: String(row.allocatedOrdinal),
    requestDigest: row.requestDigest, contractVersion: row.contractVersion,
    policyVersion: row.policyVersion,
  };
}

class OwnedMembershipA4Store {
  constructor(sql, core, { synthetic, runId, maxAttempts = 5, maxCandidates = 1000 } = {}) {
    if (synthetic !== true || !/^a4-[a-f0-9]{24}$/.test(runId ?? ""))
      throw fail("A4_SYNTHETIC_OPT_IN_REQUIRED");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10 ||
        !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 10000)
      throw fail("A4_INVALID_BUDGET");
    if (!sql?.atomic || !sql?.snapshot || !core?.formatMembershipNumber || !core?.resolveMembershipCode)
      throw fail("A4_PORT_REQUIRED");
    this.sql = sql; this.core = core; this.maxAttempts = maxAttempts;
    this.maxCandidates = maxCandidates;
  }
  async receipt(session, operationId) {
    const rows = await session.query('SELECT * FROM identity_a4_private."AllocationReceipt" WHERE "operationId"=$1::uuid', [operationId]);
    return rows[0] ?? null;
  }
  replay(row, input) {
    if (row.requestDigest !== input.digest || row.membershipId !== input.membershipId ||
        row.contractVersion !== 1 || row.policyVersion !== POLICY)
      throw fail("A4_OPERATION_CONFLICT");
    return publicReceipt(row);
  }
  async lookup(operationId) {
    if (typeof operationId !== "string" || !uuid.test(operationId)) throw fail("A4_INVALID_UUID");
    return this.sql.snapshot(async (tx) => {
      const row = await this.receipt(tx, operationId);
      return row ? publicReceipt(row) : null;
    });
  }
  async provision(command) {
    const input = prepare(command, this.core);
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await this.sql.atomic(async (tx) => {
          let previous = await this.receipt(tx, input.operationId);
          if (previous) return this.replay(previous, input);
          const counter = await tx.query('SELECT value FROM identity_a4_private."MembershipNumberCounter" WHERE id=1 FOR UPDATE');
          if (counter.length !== 1) throw fail("A4_COUNTER_MISSING");
          previous = await this.receipt(tx, input.operationId);
          if (previous) return this.replay(previous, input);
          await tx.query('INSERT INTO identity_a4_private."MembershipIdentity" ("membershipId","accountId") VALUES ($1::uuid,$2::uuid)', [input.membershipId, input.accountId]);
          for (const alias of input.aliases)
            await tx.query('INSERT INTO identity_a4_private."MembershipCode" (code,"membershipId",kind) VALUES ($1,$2::uuid,\'ALIAS\')', [alias, input.membershipId]);
          let value = BigInt(counter[0].value);
          for (let candidate = 0; candidate < this.maxCandidates; candidate++) {
            if (value >= MAX) throw fail("A4_COUNTER_EXHAUSTED");
            const rows = await tx.query('UPDATE identity_a4_private."MembershipNumberCounter" SET value=value+1 WHERE id=1 RETURNING value');
            value = BigInt(rows[0].value);
            const code = this.core.formatMembershipNumber(value);
            if (code.length > 30) throw fail("A4_CODE_CAPACITY");
            const inserted = await tx.query('INSERT INTO identity_a4_private."MembershipCode" (code,"membershipId",kind) VALUES ($1,$2::uuid,\'CANONICAL\') ON CONFLICT (code) DO NOTHING RETURNING code', [code, input.membershipId]);
            if (inserted.length === 0) continue;
            const receipt = await tx.query('INSERT INTO identity_a4_private."AllocationReceipt" ("operationId","requestDigest","contractVersion","policyVersion","membershipId","canonicalCode","allocatedOrdinal") VALUES ($1::uuid,$2,1,$3,$4::uuid,$5,$6::bigint) RETURNING *', [input.operationId, input.digest, POLICY, input.membershipId, code, String(value)]);
            return publicReceipt(receipt[0]);
          }
          throw fail("A4_CANDIDATE_BUDGET");
        });
      } catch (error) {
        const state = sqlState(error);
        // Recover a receipt race only after rollback, from a fresh snapshot.
        if (state === "23505") {
          const previous = await this.lookup(input.operationId);
          if (previous) return this.replay(previous, input);
        }
        if (!["40001", "40P01"].includes(state) || attempt + 1 === this.maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
    throw fail("A4_RETRY_EXHAUSTED");
  }
  async resolve(value, normalization) {
    return this.sql.snapshot(async (tx) => {
      const lookup = {
        byNumber: async (code) => {
          const rows = await tx.query('SELECT "membershipId" AS id, code AS number FROM identity_a4_private."MembershipCode" WHERE code=$1 AND kind=\'CANONICAL\'', [code]);
          return rows[0] ?? null;
        },
        byAlias: async (code) => {
          const rows = await tx.query('SELECT c."membershipId" AS id, n.code AS number FROM identity_a4_private."MembershipCode" c JOIN identity_a4_private."MembershipCode" n ON n."membershipId"=c."membershipId" AND n.kind=\'CANONICAL\' WHERE c.code=$1 AND c.kind=\'ALIAS\'', [code]);
          return rows[0] ?? null;
        },
      };
      return this.core.resolveMembershipCode(lookup, value, normalization);
    });
  }
}
module.exports = { OwnedMembershipA4Store, prepare, sqlState, POLICY };
