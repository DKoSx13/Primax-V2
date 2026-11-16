// SQL read adapter: owns no connection, write method, receipt lookup or actor policy.
// The supplied snapshot port MUST enforce REPEATABLE READ + READ ONLY.
class MembershipA4ReadRepository {
  constructor(sql, core) {
    if (typeof sql?.snapshot !== "function" || typeof core?.resolveMembershipCode !== "function")
      throw Error("A4_READ_PORT_REQUIRED");
    this.sql = sql;
    this.core = core;
  }
  snapshot(work) {
    return this.sql.snapshot(async (tx) => {
      const load = async (selector, id) => {
        // Selector is a closed source constant, never interpolated caller input.
        const predicate = selector === "member" ? 'm."membershipId"' : 'm."accountId"';
        const rows = await tx.query(`SELECT m."membershipId",m."accountId",n.code AS "canonicalNumber",
          COALESCE(array_agg(a.code ORDER BY a.code COLLATE "C") FILTER (WHERE a.code IS NOT NULL),ARRAY[]::varchar[]) AS "legacyNumbers"
          FROM identity_a4_private."MembershipIdentity" m
          JOIN identity_a4_private."MembershipCode" n ON n."membershipId"=m."membershipId" AND n.kind='CANONICAL'
          LEFT JOIN identity_a4_private."MembershipCode" a ON a."membershipId"=m."membershipId" AND a.kind='ALIAS'
          WHERE ${predicate}=$1::uuid GROUP BY m."membershipId",m."accountId",n.code`, [id]);
        return rows[0] ?? null;
      };
      return work({
        byMembershipId: (id) => load("member", id),
        byAccountId: (id) => load("account", id),
        resolveCode: async (value, mode) => {
          const lookup = {
            byNumber: async (code) => {
              const rows = await tx.query('SELECT "membershipId" AS id,code AS number FROM identity_a4_private."MembershipCode" WHERE code=$1 AND kind=\'CANONICAL\'', [code]);
              return rows[0] ?? null;
            },
            byAlias: async (code) => {
              const rows = await tx.query('SELECT a."membershipId" AS id,n.code AS number FROM identity_a4_private."MembershipCode" a JOIN identity_a4_private."MembershipCode" n ON n."membershipId"=a."membershipId" AND n.kind=\'CANONICAL\' WHERE a.code=$1 AND a.kind=\'ALIAS\'', [code]);
              return rows[0] ?? null;
            },
          };
          const resolved = await this.core.resolveMembershipCode(lookup, value, mode);
          if (!resolved) return null;
          const row = await load("member", resolved.membership.id);
          if (!row || row.canonicalNumber !== resolved.membership.number) throw Error("A4_INCONSISTENT_SNAPSHOT");
          return { ...row, matchedBy: resolved.matchedBy === "number" ? "CANONICAL" : "ALIAS", matchedCode: resolved.code };
        },
      });
    });
  }
}
module.exports = { MembershipA4ReadRepository };
