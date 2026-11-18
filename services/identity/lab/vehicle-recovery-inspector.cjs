// Experimental 4B.2A. No runtime registration, database writes, or repair port.
const { prepare } = require('./vehicle-link-success-authority.cjs');
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
class RecoveryError extends Error {
  constructor(code) { super(code); this.code = code; this.outcome = 'UNKNOWN'; }
}
function validateManifest(manifest, normalizers) {
  const m = clone(manifest);
  if (m.synthetic !== true || !/^a4-[a-f0-9]{24}$/.test(m.datasetId) || !/^[a-z0-9-]{4,60}$/.test(m.namespace) ||
      typeof m.checkpoint !== 'string' || !m.checkpoint || !Array.isArray(m.subjects) || !Array.isArray(m.expected) || !Array.isArray(m.legacy))
    throw new RecoveryError('INVALID_MANIFEST');
  const subjects = new Map(), memberIds = new Set();
  for (const s of m.subjects) {
    if (!uuid(s.userId) || !uuid(s.membershipId) || subjects.has(s.userId) || memberIds.has(s.membershipId)) throw new RecoveryError('INVALID_MANIFEST');
    subjects.set(s.userId, s.membershipId); memberIds.add(s.membershipId);
  }
  const keys = new Set();
  for (const e of m.expected) {
    const p = prepare(e.userId, e.command, m.namespace, normalizers, RecoveryError);
    if (subjects.get(e.userId) !== p.membershipId || keys.has(p.operationId) || typeof e.acknowledged !== 'boolean' ||
        (e.acknowledged && (!uuid(e.receipt?.vehicleId) || e.receipt.requestDigest !== p.digest ||
          e.receipt.operationId !== p.operationId || e.receipt.callerNamespace !== m.namespace ||
          e.receipt.userId !== e.userId || e.receipt.membershipId !== p.membershipId))) throw new RecoveryError('INVALID_MANIFEST');
    keys.add(p.operationId);
  }
  for (const v of m.legacy) if (!uuid(v.id) || !m.subjects.some(s => s.membershipId === v.membershipId) || typeof v.plate !== 'string')
    throw new RecoveryError('INVALID_MANIFEST');
  return freeze(m);
}
function classify(data, manifest, normalizers) {
  const findings = [];
  const add = (classification, code, operationId) => findings.push({ classification, code, ...(operationId ? { operationId } : {}) });
  if (!data || !['receipts','vehicles','memberships','users'].every(k => Array.isArray(data[k])))
    return freeze({ classification: 'INDETERMINATE', findings: [{ classification: 'INDETERMINATE', code: 'SOURCE_UNAVAILABLE' }] });
  if (!data.provenance || data.provenance.datasetId !== manifest.datasetId || data.provenance.checkpoint !== manifest.checkpoint)
    add(data.provenance ? 'INCONSISTENT' : 'INDETERMINATE', data.provenance ? 'SOURCE_CUT_MISMATCH' : 'CONTINUITY_UNATTESTED');
  const unique = (rows, field, code) => {
    const map = new Map();
    for (const row of rows) { if (map.has(row[field])) add('INCONSISTENT', code); map.set(row[field], row); }
    return map;
  };
  const vehicles = unique(data.vehicles, 'id', 'DUPLICATE_VEHICLE_UUID');
  const members = unique(data.memberships, 'id', 'DUPLICATE_MEMBERSHIP_UUID');
  const users = unique(data.users, 'id', 'DUPLICATE_USER_UUID');
  unique(data.vehicles, 'plate', 'DUPLICATE_PLATE');
  for (const s of manifest.subjects) if (!users.has(s.userId) || members.get(s.membershipId)?.userId !== s.userId)
    add('INCONSISTENT', 'SUBJECT_BINDING_MISMATCH');
  const keys = new Map(), matchedVehicles = new Set();
  const expected = new Map(manifest.expected.map(e => [e.command.operationId, e]));
  for (const r of data.receipts) {
    const op = uuid(r.operationId) ? r.operationId : undefined;
    const key = JSON.stringify([r.callerNamespace, r.operationId]);
    if (keys.has(key)) add('INCONSISTENT', 'DUPLICATE_OPERATION_KEY', op);
    keys.set(key, r);
    if (![r.operationId,r.userId,r.membershipId,r.vehicleId].every(uuid) || r.contractVersion !== 2 ||
        r.policyVersion !== 'SUCCESS_ONLY_V1' || !/^[a-f0-9]{64}$/.test(r.requestDigest) ||
        !/^[A-Z0-9]{3}-\d{3}$/.test(r.plate) || typeof r.label !== 'string' || [...r.label].length < 1 || [...r.label].length > 80 ||
        !Number.isFinite(new Date(r.recordedAt).getTime())) add('INCONSISTENT', 'INVALID_RECEIPT', op);
    if (r.callerNamespace !== manifest.namespace) add('INCONSISTENT', 'NAMESPACE_MISMATCH', op);
    if (members.get(r.membershipId)?.userId !== r.userId || !users.has(r.userId)) add('INCONSISTENT', 'RECEIPT_SUBJECT_MISMATCH', op);
    const v = vehicles.get(r.vehicleId);
    if (!v) add('INCONSISTENT', 'RECEIPT_WITHOUT_VEHICLE', op);
    else {
      matchedVehicles.add(v.id);
      if (v.membershipId !== r.membershipId || v.plate !== r.plate) add('INCONSISTENT', 'VEHICLE_BINDING_MISMATCH', op);
    }
    const e = expected.get(r.operationId);
    if (!e) add('INDETERMINATE', 'INTENTION_UNAVAILABLE', op);
    else {
      const p = prepare(e.userId, e.command, manifest.namespace, normalizers, RecoveryError);
      if (p.digest !== r.requestDigest) add('INCONSISTENT', 'DIGEST_MISMATCH', op);
      if (e.userId !== r.userId || p.membershipId !== r.membershipId || p.plate !== r.plate) add('INCONSISTENT', 'EXPECTED_IDENTITY_MISMATCH', op);
      if (e.acknowledged && (e.receipt.vehicleId !== r.vehicleId || e.receipt.label !== r.label || e.receipt.requestDigest !== r.requestDigest))
        add('INCONSISTENT', 'ACKNOWLEDGED_RESULT_MISMATCH', op);
    }
  }
  for (const e of manifest.expected) if (!keys.has(JSON.stringify([manifest.namespace,e.command.operationId])))
    add(e.acknowledged ? 'INCONSISTENT' : 'INDETERMINATE', e.acknowledged ? 'EXPECTED_SUCCESS_RECEIPT_MISSING' : 'NOT_OBSERVED', e.command.operationId);
  for (const v of data.vehicles) {
    if (!uuid(v.id) || (v.membershipId !== null && !uuid(v.membershipId))) add('INCONSISTENT', 'INVALID_VEHICLE_UUID');
    if (v.membershipId && !members.has(v.membershipId)) add('INCONSISTENT', 'VEHICLE_MEMBERSHIP_MISSING');
    if (!matchedVehicles.has(v.id)) {
      const legacy = manifest.legacy.find(l => l.id === v.id && l.membershipId === v.membershipId && l.plate === v.plate);
      if (legacy) add('CONSISTENT', 'DECLARED_LEGACY_WITHOUT_RECEIPT');
      else add('INDETERMINATE', 'UNATTRIBUTED_LINK');
    }
  }
  const classification = findings.some(f => f.classification === 'INCONSISTENT') ? 'INCONSISTENT' :
    findings.some(f => f.classification === 'INDETERMINATE') ? 'INDETERMINATE' : 'CONSISTENT';
  return freeze({ classification, scope: 'EXPLICIT_SYNTHETIC_EXPECTATIONS', findings });
}
class VehicleRecoveryInspector {
  #snapshot; #manifest; #normalizers;
  constructor({ synthetic, snapshot, manifest, normalizers }) {
    if (synthetic !== true || typeof snapshot !== 'function') throw new RecoveryError('PRIVATE_LAB_REQUIRED');
    this.#manifest = validateManifest(manifest, normalizers); this.#snapshot = snapshot; this.#normalizers = normalizers;
  }
  async inspect() {
    try { return classify(await this.#snapshot(), this.#manifest, this.#normalizers); }
    catch { return freeze({ classification: 'INDETERMINATE', findings: [{ classification: 'INDETERMINATE', code: 'SOURCE_UNAVAILABLE' }] }); }
  }
  async lookupOwn(principal, operationId) {
    if (principal?.kind !== 'member' || !uuid(principal.userId) || !principal.permissions?.includes('vehicle:result:own')) throw new RecoveryError('DENIED');
    const e = this.#manifest.expected.find(e => e.command.operationId === operationId && e.userId === principal.userId);
    if (!e) return freeze({ status: 'NOT_OBSERVED' }); // Same projection for foreign and absent; no global findings.
    let data;
    try { data = await this.#snapshot(); } catch { throw new RecoveryError('UNAVAILABLE'); }
    const subject = this.#manifest.subjects.find(s => s.userId === principal.userId);
    if (!data.users.some(u => u.id === subject.userId && u.active === true) ||
        !data.memberships.some(s => s.id === subject.membershipId && s.userId === subject.userId && s.status === 'ACTIVE')) throw new RecoveryError('DENIED');
    const ownReceipts = data.receipts.filter(r => r.userId === principal.userId && r.membershipId === subject.membershipId && r.operationId === operationId);
    const ownVehicles = data.vehicles.filter(v => v.membershipId === subject.membershipId && (v.id === e.receipt?.vehicleId || ownReceipts.some(r => r.vehicleId === v.id)));
    const m = { ...this.#manifest, subjects: [subject], expected: [e], legacy: [] };
    const report = classify({ ...data, receipts: ownReceipts, vehicles: ownVehicles,
      memberships: data.memberships.filter(s => s.id === subject.membershipId), users: data.users.filter(u => u.id === subject.userId) }, m, this.#normalizers);
    return freeze({ classification: report.classification, codes: [...new Set(report.findings.map(f => f.code))] });
  }
}
// Synthetic authentication boundary. The inspector itself is an internal trusted port.
class PrivateRecoveryDiagnostics {
  #authorization; #inspector;
  constructor({ synthetic, authorization, inspector }) {
    if (synthetic !== true || typeof authorization?.authenticate !== 'function' || !(inspector instanceof VehicleRecoveryInspector))
      throw new RecoveryError('PRIVATE_LAB_REQUIRED');
    this.#authorization = authorization; this.#inspector = inspector;
  }
  async #principal(credential) {
    try { return await this.#authorization.authenticate(credential); }
    catch { throw new RecoveryError('DENIED'); }
  }
  async inspect(credential) {
    const p = await this.#principal(credential);
    if (p?.kind !== 'reconciler' || !p.permissions?.includes('vehicle:recovery:inspect')) throw new RecoveryError('DENIED');
    return this.#inspector.inspect();
  }
  async lookup(credential, operationId) { return this.#inspector.lookupOwn(await this.#principal(credential), operationId); }
}
module.exports = { RecoveryError, VehicleRecoveryInspector, PrivateRecoveryDiagnostics, classify, validateManifest };
