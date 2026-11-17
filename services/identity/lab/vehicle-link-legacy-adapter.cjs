// Provider-side private adapters. The REAL VehiclesRepository.link is the only
// implementation of eligibility, plate ownership, create/update and repeat rules.
class LegacyVehicleLinkAdapter {
  constructor({ database, repository, ownerService, readError, synthetic }) {
    if (synthetic !== true || typeof database?.atomic !== "function" || typeof repository !== "function" ||
        typeof ownerService?.findByPlate !== "function" || typeof readError !== "function")
      throw Error("PRIVATE_LEGACY_VEHICLE_AUTHORITY_REQUIRED");
    this.database = database; this.repository = repository; this.ownerService = ownerService; this.Error = readError;
  }
  binding(row) { return { vehicleId: row.id, membershipId: row.membershipId, plate: row.plate, label: row.label }; }
  async linkForOwner({ userId, expectedMembershipId, plate, label }) {
    // Additional binding precondition INSIDE the existing authority transaction.
    // No second transaction, eligibility implementation or raw Vehicle write.
    const scopedDatabase = { atomic: work => this.database.atomic(async tx => {
      const member = await tx.membership.findUnique({ where: { userId }, select: { id: true } });
      if (!member) throw new this.Error("NOT_FOUND", "REJECTED");
      if (member.id !== expectedMembershipId) throw new this.Error("BINDING_MISMATCH", "REJECTED");
      return work(tx);
    }) };
    try { return this.binding(await this.repository(scopedDatabase).link(userId, plate, label)); }
    catch (error) {
      if (error instanceof this.Error) throw error;
      const status = typeof error?.getStatus === "function" ? error.getStatus() : null;
      if (status === 403) throw new this.Error("DENIED", "REJECTED");
      if (status === 404) throw new this.Error("NOT_FOUND", "REJECTED");
      if (status === 409) throw new this.Error("OWNERSHIP_CONFLICT", "REJECTED");
      if (status === 503) throw new this.Error("UNAVAILABLE", "REJECTED");
      throw new this.Error("OUTCOME_UNKNOWN", "UNKNOWN");
    }
  }
  async forOwner({ userId, plate }) {
    try {
      // Reuse actual service authorization (foreign resource is NotFound).
      const view = await this.ownerService.findByPlate(plate, { kind: "member", userId });
      return this.binding({ ...view, membershipId: view.membership?.id });
    } catch (error) {
      const status = typeof error?.getStatus === "function" ? error.getStatus() : null;
      throw new this.Error(status === 404 ? "NOT_FOUND" : status === 403 ? "DENIED" : "UNAVAILABLE");
    }
  }
}
module.exports = { LegacyVehicleLinkAdapter };
