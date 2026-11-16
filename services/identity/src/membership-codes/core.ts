/** A.4 phases 0/1: pure, opt-in core. No runtime or persistence adapter uses it. */
export interface MembershipIdentity {
  readonly id: string;
  readonly number: string;
}

/** Read port only. Implementations must return the member owning the exact key.
 * A missing key returns null; unavailable/corrupt storage must reject, not return null.
 * No normalization, writes, authorization or financial decisions belong in this port.
 */
export interface MembershipCodeLookup {
  byNumber(code: string): Promise<MembershipIdentity | null>;
  byAlias(code: string): Promise<MembershipIdentity | null>;
}

/** Existing call sites differ; callers must choose rather than inherit a new policy. */
export type CodeNormalization = "exact" | "trim-uppercase";

export interface MembershipCodeResolution {
  readonly membership: MembershipIdentity;
  readonly matchedBy: "number" | "alias";
  readonly code: string;
}

/** Same positive-bigint mapping as the legacy formatter. This does not allocate
 * an ordinal or enforce SQL capacity/column length; those remain adapter concerns.
 */
export function formatMembershipNumber(value: bigint): string {
  if (typeof value !== "bigint" || value < 1n)
    throw new RangeError("Invalid membership ordinal");
  let group = (value - 1n) / 999n;
  let prefix = "";
  while (group > 0n) {
    group -= 1n;
    prefix = String.fromCharCode(65 + Number(group % 26n)) + prefix;
    group /= 26n;
  }
  return `PRIME-${prefix}${String(((value - 1n) % 999n) + 1n).padStart(3, "0")}`;
}

/** Syntax of generated numbers only, not a rule for historical aliases or DTOs. */
export function isCanonicalMembershipNumber(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^PRIME-[A-Z]*[0-9]{3}$/.test(value) &&
    !value.endsWith("000")
  );
}

/** Existing transport shape: 4..30 ASCII uppercase letters, digits or hyphens.
 * Shape does not establish existence, ownership, canonical format or permission.
 * No OCR substitutions or removal of internal punctuation/whitespace are applied.
 */
export function normalizeMembershipCode(
  value: unknown,
  mode: CodeNormalization,
): string | null {
  if (mode !== "exact" && mode !== "trim-uppercase")
    throw new RangeError("Explicit membership code normalization required");
  if (typeof value !== "string") return null;
  const code = mode === "trim-uppercase" ? value.trim().toUpperCase() : value;
  return /^[A-Z0-9-]{4,30}$/.test(code) ? code : null;
}

/** Legacy lookup order: canonical number first, then historical alias.
 * Two reads are not a transactional snapshot. A future adapter must establish
 * the required consistency; this function neither locks nor caches anything.
 */
export async function resolveMembershipCode(
  lookup: MembershipCodeLookup,
  value: unknown,
  normalization: CodeNormalization,
): Promise<MembershipCodeResolution | null> {
  const code = normalizeMembershipCode(value, normalization);
  if (code === null) return null;
  const direct = await lookup.byNumber(code);
  if (direct)
    return {
      membership: { id: direct.id, number: direct.number },
      matchedBy: "number",
      code,
    };
  const alias = await lookup.byAlias(code);
  return alias
    ? {
        membership: { id: alias.id, number: alias.number },
        matchedBy: "alias",
        code,
      }
    : null;
}

/** Legacy member-specific comparison: equality or alias belonging to this UUID.
 * Deliberately distinct from global lookup on a cross-namespace collision.
 * Does not check active state, Vehicle, actor permissions or financial eligibility.
 */
export async function matchesMembershipCode(
  lookup: Pick<MembershipCodeLookup, "byAlias">,
  membership: MembershipIdentity | null | undefined,
  value: unknown,
  normalization: CodeNormalization,
): Promise<boolean> {
  const code = normalizeMembershipCode(value, normalization);
  if (!membership || code === null) return false;
  if (membership.number === code) return true;
  const alias = await lookup.byAlias(code);
  return alias?.id === membership.id;
}
