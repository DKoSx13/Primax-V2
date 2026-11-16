const { test } = require("node:test");
const assert = require("node:assert/strict");

// Normal package tests use the compiled module. The isolated command explicitly
// enables Node's type stripping to test only this source, without build/Prisma.
const core = require(
  process.execArgv.includes("--experimental-strip-types")
    ? "../src/membership-codes/core.ts"
    : "../dist/membership-codes/core.js",
);
const {
  formatMembershipNumber,
  isCanonicalMembershipNumber,
  normalizeMembershipCode,
  resolveMembershipCode,
  matchesMembershipCode,
} = core;

const first = Object.freeze({ id: "synthetic-member-a", number: "PRIME-001" });
const second = Object.freeze({ id: "synthetic-member-b", number: "PRIME-A001" });

function fixture({ numbers = [], aliases = [] } = {}) {
  const calls = [];
  const numberMap = new Map(numbers);
  const aliasMap = new Map(aliases);
  return {
    calls,
    lookup: {
      async byNumber(code) {
        calls.push(["number", code]);
        return numberMap.get(code) ?? null;
      },
      async byAlias(code) {
        calls.push(["alias", code]);
        return aliasMap.get(code) ?? null;
      },
    },
  };
}

test("preserves legacy numbering at numeric and alphabetic boundaries", () => {
  for (const [ordinal, expected] of [
    [1n, "PRIME-001"],
    [999n, "PRIME-999"],
    [1000n, "PRIME-A001"],
    [1998n, "PRIME-A999"],
    [1999n, "PRIME-B001"],
    [26973n, "PRIME-Z999"],
    [26974n, "PRIME-AA001"],
    [52947n, "PRIME-AZ999"],
    [52948n, "PRIME-BA001"],
  ]) {
    assert.equal(formatMembershipNumber(ordinal), expected);
  }
});

test("formats 53000 unique canonical codes without a zero suffix", () => {
  const numbers = new Set();
  for (let ordinal = 1n; ordinal <= 53000n; ordinal++) {
    const number = formatMembershipNumber(ordinal);
    assert.equal(isCanonicalMembershipNumber(number), true);
    numbers.add(number);
  }
  assert.equal(numbers.size, 53000);
});

test("rejects nonpositive and non-bigint ordinals without coercion", () => {
  for (const value of [0n, -1n, 1, 1.5, NaN, Infinity, "1", null, undefined])
    assert.throws(() => formatMembershipNumber(value), RangeError);
});

test("retains bigint precision beyond Number.MAX_SAFE_INTEGER", () => {
  const value = 9007199254740993n;
  const number = formatMembershipNumber(value);
  const [, prefix, suffix] = /^PRIME-([A-Z]*)([0-9]{3})$/.exec(number);
  let group = 0n;
  for (const letter of prefix)
    group = group * 26n + BigInt(letter.charCodeAt(0) - 64);
  assert.equal(group * 999n + BigInt(suffix), value);
  assert.notEqual(number, formatMembershipNumber(value - 1n));
});

test("canonical syntax excludes malformed numbers without excluding legacy aliases", () => {
  for (const value of [
    "PRIME-000", "PRIME-A000", "PRIME-01", "PRIME-0001", "PRIME-001A",
    "PRIME-a001", "prime-001", "PRIM001", "PRIM-001A", " PRIME-001",
    "PRIME-001\n", "PRIME-0010", null, 1,
  ]) assert.equal(isCanonicalMembershipNumber(value), false, String(value));
  for (const value of ["PRIM001", "PRIM-001A", "PRIME-0001"])
    assert.equal(normalizeMembershipCode(value, "exact"), value);
});

test("normalization is explicit and preserves punctuation and leading zeroes", () => {
  assert.equal(normalizeMembershipCode(" prime-aa001 ", "trim-uppercase"), "PRIME-AA001");
  assert.equal(normalizeMembershipCode(" prim-001a ", "trim-uppercase"), "PRIM-001A");
  assert.equal(normalizeMembershipCode("PRIME-0001", "exact"), "PRIME-0001");
  assert.equal(normalizeMembershipCode(" prime-001 ", "exact"), null);
  assert.equal(normalizeMembershipCode("prime-001", "exact"), null);
  assert.throws(() => normalizeMembershipCode("PRIME-001"), RangeError);
  assert.throws(() => normalizeMembershipCode("PRIME-001", "ocr"), RangeError);
});

test("transport validation bounds length and rejects invalid inputs", () => {
  assert.equal(normalizeMembershipCode("A".repeat(4), "exact"), "AAAA");
  assert.equal(normalizeMembershipCode("A".repeat(30), "exact"), "A".repeat(30));
  for (const value of [
    "", "ABC", "A".repeat(31), "PRIME A001", "PRIME_A001", "PRIME/A001",
    "PRIME-Á001", "PRIME-001\n", {}, [], null, undefined, 123,
  ]) assert.equal(normalizeMembershipCode(value, "exact"), null, String(value));
  assert.equal(normalizeMembershipCode("pr1me a001", "trim-uppercase"), null);
  // No O/I replacement, prefix conversion or alias-to-canonical rewriting.
  assert.equal(normalizeMembershipCode("PRIMOO1", "trim-uppercase"), "PRIMOO1");
});

test("direct resolution avoids an alias read and projects only identity fields", async () => {
  const member = { ...first, privateFixture: "must not be returned" };
  const { calls, lookup } = fixture({ numbers: [[first.number, member]] });
  assert.deepEqual(await resolveMembershipCode(lookup, first.number, "exact"), {
    membership: first, matchedBy: "number", code: first.number,
  });
  assert.deepEqual(calls, [["number", first.number]]);
});

test("alias resolution preserves the UUID and canonical number", async () => {
  const { calls, lookup } = fixture({ aliases: [["PRIM001A", second]] });
  assert.deepEqual(await resolveMembershipCode(lookup, " prim001a ", "trim-uppercase"), {
    membership: second, matchedBy: "alias", code: "PRIM001A",
  });
  assert.deepEqual(calls, [["number", "PRIM001A"], ["alias", "PRIM001A"]]);
});

test("unknown codes return null while malformed codes do not reach the port", async () => {
  const { calls, lookup } = fixture();
  assert.equal(await resolveMembershipCode(lookup, "UNKNOWN", "exact"), null);
  assert.deepEqual(calls, [["number", "UNKNOWN"], ["alias", "UNKNOWN"]]);
  calls.length = 0;
  for (const value of ["bad code", null, "PRIME-001\n"])
    assert.equal(await resolveMembershipCode(lookup, value, "exact"), null);
  assert.deepEqual(calls, []);
});

test("comparison accepts a member's number and aliases but rejects another UUID", async () => {
  const { calls, lookup } = fixture({
    aliases: [["PRIM001", first], ["PRIM001A", second]],
  });
  assert.equal(await matchesMembershipCode(lookup, first, first.number, "exact"), true);
  assert.deepEqual(calls, []);
  assert.equal(await matchesMembershipCode(lookup, first, "PRIM001", "exact"), true);
  assert.equal(await matchesMembershipCode(lookup, first, "PRIM001A", "exact"), false);
  assert.equal(await matchesMembershipCode(lookup, first, "UNKNOWN", "exact"), false);
});

test("missing membership and invalid comparison inputs perform no reads", async () => {
  const { calls, lookup } = fixture();
  for (const member of [null, undefined])
    assert.equal(await matchesMembershipCode(lookup, member, first.number, "exact"), false);
  assert.equal(await matchesMembershipCode(lookup, first, "bad code", "exact"), false);
  assert.deepEqual(calls, []);
});

test("exact and trim-uppercase comparison remain separate choices", async () => {
  const { calls, lookup } = fixture({ aliases: [["PRIM001", first]] });
  assert.equal(await matchesMembershipCode(lookup, first, " prim001 ", "exact"), false);
  assert.deepEqual(calls, []);
  assert.equal(await matchesMembershipCode(lookup, first, " prim001 ", "trim-uppercase"), true);
  assert.deepEqual(calls, [["alias", "PRIM001"]]);
});

test("documents existing cross-namespace collision divergence without a new policy", async () => {
  const { lookup } = fixture({
    numbers: [[first.number, first]],
    aliases: [[first.number, second]],
  });
  const resolved = await resolveMembershipCode(lookup, first.number, "exact");
  assert.equal(resolved.membership.id, first.id);
  assert.equal(await matchesMembershipCode(lookup, second, first.number, "exact"), true);
});

test("lookup failures propagate without fallback, retries or false absence", async () => {
  const failure = new Error("synthetic unavailable lookup");
  let aliasCalls = 0;
  let directCalls = 0;
  const lookup = {
    async byNumber() { directCalls++; throw failure; },
    async byAlias() { aliasCalls++; return first; },
  };
  await assert.rejects(resolveMembershipCode(lookup, "PRIM001", "exact"), (e) => e === failure);
  assert.equal(directCalls, 1);
  assert.equal(aliasCalls, 0);
  const failedAlias = {
    async byNumber() { return null; },
    async byAlias() { throw failure; },
  };
  await assert.rejects(resolveMembershipCode(failedAlias, "PRIM001", "exact"), (e) => e === failure);
  await assert.rejects(matchesMembershipCode(failedAlias, first, "PRIM001", "exact"), (e) => e === failure);
});
