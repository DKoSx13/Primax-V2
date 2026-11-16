// PRIVATE provisioning/read adapter. Not HTTP registration and not wired in any runtime.
// AuthCore-compatible reads; no financial/operational clients or dependencies.
class OwnedAccountStore {
  constructor(db, { synthetic, assertIdentity }) {
    if (synthetic !== true || typeof assertIdentity !== "function")
      throw Error("Private synthetic opt-in required");
    this.db = db;
    this.assertIdentity = assertIdentity;
  }
  async provisionSyntheticIdentity(input) {
    const allowed = ["name", "email", "passwordHash", "dni", "passport"];
    if (!input || Object.keys(input).some((k) => !allowed.includes(k)))
      throw Error("OWNERSHIP_BOUNDARY");
    this.assertIdentity(input);
    // The caller uses the existing DTO validation; this is fixture provisioning,
    // deliberately not AuthCore.register (which also provisions Membership/welcome).
    return this.db.$transaction((tx) =>
      tx.account.create({
        data: {
          name: input.name,
          email: input.email.trim().toLowerCase(),
          passwordHash: input.passwordHash,
          profile: {
            create: {
              dni: input.dni ?? null,
              passport: input.passport ?? null,
            },
          },
        },
        select: { id: true, name: true, email: true, authVersion: true },
      }),
    );
  }
  findById(id) {
    return this.db.account.findUnique({ where: { id } });
  }
  findByEmail(email) {
    return this.db.account.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }
  async findByDni(dni) {
    const profile = await this.db.identityProfile.findUnique({
      where: { dni },
      include: { account: true },
    });
    return profile?.account ?? null;
  }
  profileFor(accountId) {
    return this.db.identityProfile.findUnique({
      where: { accountId },
      select: {
        accountId: true,
        dni: true,
        passport: true,
        account: { select: { id: true, name: true, email: true } },
      },
    });
  }
  async incrementAuthVersion(id) {
    await this.db.account.update({
      where: { id },
      data: { authVersion: { increment: 1 } },
    });
  }
}
module.exports = { OwnedAccountStore };
