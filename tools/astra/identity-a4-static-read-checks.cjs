// Source-derived probes only. No Control service, database, server or OCR process.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
module.exports = async function staticChecks({ ts, root, core }) {
  const filename = path.join(root, "Backend/src/control/control-customers.service.ts");
  const source = fs.readFileSync(filename, "utf8");
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true);
  const definition = ast.statements.find((s) => ts.isClassDeclaration(s) && s.name?.text === "ControlCustomersService");
  assert.ok(definition);
  const names = ["scope", "membershipStationFilter", "vehicleStationFilter", "customers", "memberships", "vehicles", "maskEmail"];
  const methods = names.map((name) => {
    const member = definition.members.find((m) => ts.isMethodDeclaration(m) && m.name?.getText(ast) === name);
    assert.ok(member, "Source method missing: " + name);
    return member.getText(ast);
  });
  const probeSource = `class SourceProbe { constructor(db){this.db=db;} ${methods.join("\n")} }; module.exports=SourceProbe;`;
  const js = ts.transpileModule(probeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { module: { exports: {} }, ForbiddenException: Error,
    AdminControlPermission: new Proxy({}, { get: (_, key) => String(key) }) };
  vm.runInNewContext(js, context, { timeout: 1000 });
  let where;
  const probe = new context.module.exports({ membership: { async findMany(input) { where = input.where; return []; } },
    vehicle: { async findMany(input) { where = input.where; return []; } } });
  const actor = { kind: "control", global: false, userId: "synthetic-control", stationIds: ["synthetic-station-a"],
    permissions: ["ADMIN_CUSTOMER_VIEW", "ADMIN_MEMBERSHIP_VIEW", "ADMIN_VEHICLE_VIEW"] };
  const activityOr = (v) => Array.isArray(v?.OR) && v.OR.some((x) => x.transactions || x.authorizations);
  const results = [];
  for (const operation of ["customers", "memberships"]) {
    await probe[operation](actor, {}); assert.equal(activityOr(where), true);
    await probe[operation](actor, { q: "   " }); assert.equal(activityOr(where), true);
    await probe[operation](actor, { q: "synthetic-search", stationId: "synthetic-station-a" });
    assert.equal(activityOr(where), false);
    assert.equal(where.OR[0].number.contains, "synthetic-search");
    results.push({ operation, withoutSearchHasActivityOr: true, searchOverwritesTopLevelActivityOr: true });
  }
  await probe.vehicles(actor, { q: "synthetic-search" });
  assert.equal(Array.isArray(where.AND), true);
  assert.equal(where.AND.some(activityOr), true);
  await assert.rejects(probe.customers({ ...actor, stationIds: [] }, { q: "search" }));
  await assert.rejects(probe.memberships(actor, { q: "search", stationId: "synthetic-station-b" }));

  const recognition = fs.readFileSync(path.join(root, "Backend/src/vehicles/recognition.service.ts"), "utf8");
  const recognitionAst = ts.createSourceFile("recognition.ts", recognition, ts.ScriptTarget.ES2022, true);
  let literal;
  function visit(node) {
    if (ts.isRegularExpressionLiteral(node) && node.getText(recognitionAst).startsWith("/^PRIM")) literal = node.getText(recognitionAst);
    ts.forEachChild(node, visit);
  }
  visit(recognitionAst); assert.ok(literal);
  const regex = vm.runInNewContext(literal, {}, { timeout: 1000 });
  const cases = [
    ["PRIME-001", true, true], ["PRIME-A001", true, false], ["PRIME-AA001", true, false],
    ["PRIM001A", false, true], ["PRIM-001A", false, false], ["PRIM001AA", false, false],
    ["PRIME-0001", false, true], ["PRIME-000", false, true],
  ].map(([code, canonical, accepted]) => {
    assert.equal(core.isCanonicalMembershipNumber(code), canonical);
    assert.equal(regex.test(code), accepted);
    return { code, a4CanonicalSyntax: canonical, nestMembershipFilter: accepted, a4TransportShape: core.normalizeMembershipCode(code, "exact") !== null };
  });
  const python = fs.readFileSync(path.join(root, "PlateRecognition/app.py"), "utf8");
  assert.ok(python.includes("re.fullmatch(r'PRIME[0-9]+', compact)"));
  assert.ok(python.includes("re.fullmatch(r'PRIM[0-9]+[A-Z]?', compact)"));
  return { control: { verification: "actual source method query construction with empty fake repositories; no HTTP/DB exploitation", results,
    vehiclesRetainsAndScope: true, noAssignmentsAndForeignStationStillRejected: true },
    ocr: { nestFilter: literal, cases, python: "source inspected only; no OCR/photo execution" } };
};
