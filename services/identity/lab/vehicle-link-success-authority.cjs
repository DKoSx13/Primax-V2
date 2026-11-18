const { createHash } = require("node:crypto");
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
function prepare(userId, command, namespace, normalizers, ErrorType) {
  const invalid = () => { throw new ErrorType("INVALID_INPUT", "NOT_SENT"); };
  if (!uuid(userId) || !command || Object.keys(command).sort().join(",") !== "contractVersion,expectedMembershipId,label,operationId,plate" ||
      command.contractVersion !== 2 || !uuid(command.operationId) || !uuid(command.expectedMembershipId)) invalid();
  let plate, label;
  try { plate = normalizers.plate(command.plate); label = normalizers.label(command.label); } catch { invalid(); }
  if (typeof plate !== "string" || !/^[A-Z0-9]{3}-\d{3}$/.test(plate) || typeof label !== "string" || [...label].length < 1 || [...label].length > 80) invalid();
  const digest = createHash("sha256").update(JSON.stringify([2,"SUCCESS_ONLY_V1","PLATE_DTO_V1",namespace,
    command.operationId,userId,command.expectedMembershipId,plate,label]), "utf8").digest("hex");
  return { userId, membershipId: command.expectedMembershipId, operationId: command.operationId, plate, label, digest };
}
class VehicleSuccessReceiptReader {
  constructor({ reader, callerNamespace, ErrorType, synthetic }) {
    if (synthetic !== true || typeof reader?.snapshot !== "function" || typeof ErrorType !== "function" ||
        !/^[a-z0-9-]{4,60}$/.test(callerNamespace)) throw Error("PRIVATE_RECEIPT_READER_REQUIRED");
    this.reader = reader; this.namespace = callerNamespace; this.Error = ErrorType;
  }
  async eligible(tx, userId, membershipId) {
    const member = await tx.membership.findUnique({ where: { userId }, include: { user: { select: { active: true } } } });
    if (!member) throw new this.Error("NOT_FOUND", "REJECTED");
    if (member.id !== membershipId) throw new this.Error("BINDING_MISMATCH", "REJECTED");
    // Same eligibility rule for replay/query; never obtain fresh permission from a historical receipt.
    if (!member.user.active || member.status !== "ACTIVE") throw new this.Error("DENIED", "REJECTED");
  }
  async load(tx, operationId) {
    const rows = await tx.$queryRawUnsafe('SELECT * FROM vehicle_link_private."SuccessReceipt" WHERE "callerNamespace"=$1 AND "operationId"=$2::uuid', this.namespace, operationId);
    return rows[0] ?? null;
  }
  async view(tx, row) {
    const vehicle = await tx.vehicle.findUnique({ where: { id: row.vehicleId } });
    if (!vehicle || vehicle.membershipId !== row.membershipId || vehicle.plate !== row.plate) throw new this.Error("RECOVERY_REQUIRED", "UNKNOWN");
    return Object.freeze({ status: "COMMITTED", receipt: Object.freeze({ contractVersion: row.contractVersion,
      policyVersion: row.policyVersion, callerNamespace: row.callerNamespace, operationId: row.operationId,
      userId: row.userId, membershipId: row.membershipId, vehicleId: row.vehicleId, requestDigest: row.requestDigest,
      plate: row.plate, label: row.label, recordedAt: new Date(row.recordedAt).toISOString() }) });
  }
  async lookup({ userId, expectedMembershipId, operationId }) {
    if (![userId,expectedMembershipId,operationId].every(uuid)) throw new this.Error("INVALID_INPUT", "NOT_SENT");
    try { return await this.reader.snapshot(async tx => {
      await this.eligible(tx, userId, expectedMembershipId);
      const row = await this.load(tx, operationId);
      if (!row || row.userId !== userId || row.membershipId !== expectedMembershipId) return Object.freeze({ status: "NOT_OBSERVED" });
      return this.view(tx, row);
    }); } catch (error) {
      if (error instanceof this.Error) throw new this.Error(error.code, "UNKNOWN");
      throw new this.Error("UNAVAILABLE", "UNKNOWN");
    }
  }
}
class VehicleSuccessAuthority extends VehicleSuccessReceiptReader {
  constructor(options) {
    super(options);
    if (typeof options.writer?.atomic !== "function" || typeof options.repository !== "function" ||
        typeof options.normalizers?.plate !== "function" || typeof options.normalizers?.label !== "function") throw Error("PRIVATE_RECEIPT_WRITER_REQUIRED");
    this.writer = options.writer; this.repository = options.repository; this.normalizers = options.normalizers;
  }
  async submit(userId, command) {
    const input = prepare(userId, command, this.namespace, this.normalizers, this.Error);
    let result;
    // Decorate the existing repository's atomic port. No independent link implementation.
    const scoped = { atomic: work => this.writer.atomic(async tx => {
      result = undefined;
      await this.eligible(tx, userId, input.membershipId);
      let row = await this.load(tx, input.operationId);
      if (row) {
        if (row.requestDigest !== input.digest || row.userId !== userId || row.membershipId !== input.membershipId)
          throw new this.Error("IDEMPOTENCY_CONFLICT", "REJECTED");
        result = await this.view(tx, row);
        // Bypass the work callback: a stored result is not another linking attempt.
        return { id: row.vehicleId, membershipId: row.membershipId, plate: row.plate, label: row.label };
      }
      const vehicle = await work(tx);
      const rows = await tx.$queryRawUnsafe(`INSERT INTO vehicle_link_private."SuccessReceipt"
        ("callerNamespace","operationId","userId","membershipId","vehicleId","requestDigest","contractVersion","policyVersion",plate,label)
        VALUES ($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,2,'SUCCESS_ONLY_V1',$7,$8) RETURNING *`,
      this.namespace,input.operationId,userId,input.membershipId,vehicle.id,input.digest,vehicle.plate,vehicle.label);
      row = rows[0]; result = await this.view(tx, row); return vehicle;
    }) };
    try {
      await this.repository(scoped).link(userId, input.plate, input.label);
      if (!result) throw new this.Error("OUTCOME_UNKNOWN", "UNKNOWN");
      return result;
    } catch (error) {
      if (error instanceof this.Error) throw error;
      const status = typeof error?.getStatus === "function" ? error.getStatus() : null;
      if (status === 403) throw new this.Error("DENIED", "REJECTED");
      if (status === 409) throw new this.Error("OWNERSHIP_CONFLICT", "REJECTED");
      if (status === 404) throw new this.Error("NOT_FOUND", "REJECTED");
      // Even an exhausted/transport failure is not evidence about an earlier attempt with this key.
      throw new this.Error("OUTCOME_UNKNOWN", "UNKNOWN");
    }
  }
}
module.exports = { VehicleSuccessAuthority, VehicleSuccessReceiptReader, prepare };
