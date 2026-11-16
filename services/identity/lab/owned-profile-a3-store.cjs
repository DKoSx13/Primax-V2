// PRIVATE provisioning/read adapter. Not HTTP registration and not wired in any runtime.
// AuthCore-compatible reads; no financial/operational clients or dependencies.
class OwnedProfileA3Store {
  constructor(db, { synthetic, assertIdentity, validateProfile }) {
    if (
      synthetic !== true ||
      typeof assertIdentity !== "function" ||
      typeof validateProfile !== "function"
    )
      throw Error("Private synthetic opt-in required");
    this.db = db;
    this.assertIdentity = assertIdentity;
    this.validateProfile = validateProfile;
  }
  async provisionSyntheticIdentity(input) {
    const allowed = [
      "name",
      "email",
      "passwordHash",
      "dni",
      "passport",
      "ruc",
      "businessName",
    ];
    if (!input || Object.keys(input).some((k) => !allowed.includes(k)))
      throw Error("OWNERSHIP_BOUNDARY");
    const profile = await this.validateProfile(
      Object.fromEntries(
        ["dni", "passport", "ruc", "businessName"]
          .filter((k) => input[k] !== undefined)
          .map((k) => [k, input[k]]),
      ),
    );
    this.assertIdentity(profile);
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
              dni: profile.dni ?? null,
              passport: profile.passport ?? null,
              ruc: profile.ruc ?? null,
              businessName: profile.businessName ?? null,
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
        ruc: true,
        businessName: true,
        account: { select: { id: true, name: true, email: true } },
      },
    });
  }
  async updateSyntheticProfile(accountId, patch) {
    if (
      !patch ||
      Object.keys(patch).some(
        (k) => !["dni", "passport", "ruc", "businessName"].includes(k),
      )
    )
      throw Error("OWNERSHIP_BOUNDARY");
    const data = await this.validateProfile(patch);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.db.$transaction(
          async (tx) => {
            const current = await tx.identityProfile.findUniqueOrThrow({
              where: { accountId },
            });
            this.assertIdentity({ ...current, ...data });
            await tx.identityProfile.update({ where: { accountId }, data });
          },
          { isolationLevel: "Serializable" },
        );
        return this.profileFor(accountId);
      } catch (e) {
        if (e.code !== "P2034" || attempt === 4) throw e;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
  }
  async incrementAuthVersion(id) {
    await this.db.account.update({
      where: { id },
      data: { authVersion: { increment: 1 } },
    });
  }
}
module.exports = { OwnedProfileA3Store };
