// UI compatibility only. Backend still validates ownership/plate and alias UUID.
export function matchesMembershipCode(membership, code) {
  return Boolean(membership && (membership.number === code || membership.legacyNumbers?.includes(code)));
}
