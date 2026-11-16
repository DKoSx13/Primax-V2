// Private adapter over injected, existing Backend services. Never imports/bootstrap runtime.
// JSON serialization matches the wire representation (Decimal/Date included).
class LegacyA4ReadProvider {
  constructor({ membershipsRepository, membershipsService, vehiclesService, readError, synthetic }) {
    if (synthetic !== true || typeof readError !== "function" ||
        typeof membershipsRepository?.findForUser !== "function" ||
        typeof membershipsService?.me !== "function" || typeof vehiclesService?.list !== "function")
      throw Error("A4_PRIVATE_LEGACY_PORT_REQUIRED");
    this.repo = membershipsRepository; this.memberships = membershipsService;
    this.vehicleService = vehiclesService; this.ReadError = readError;
  }
  async read(work) {
    try { return JSON.parse(JSON.stringify(await work())); }
    catch (error) {
      const status = typeof error?.getStatus === "function" ? error.getStatus() : null;
      throw new this.ReadError(status === 404 ? "NOT_FOUND" : status === 403 ? "DENIED" : "UNAVAILABLE");
    }
  }
  anchor(userId) {
    return this.read(async () => {
      const value = await this.repo.findForUser(userId);
      return value ? { id: value.id, userId: value.userId, number: value.number } : null;
    });
  }
  me(userId) { return this.read(() => this.memberships.me(userId)); }
  vehicles(userId, query) {
    return this.read(() => this.vehicleService.list({ kind: "member", userId }, query));
  }
}
module.exports = { LegacyA4ReadProvider };
