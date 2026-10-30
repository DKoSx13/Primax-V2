import {
  formatMembershipNumber,
  nextMembershipNumber,
} from './membership-number';

describe('PRIME public numbering', () => {
  it.each([
    [1n, 'PRIME-001'],
    [999n, 'PRIME-999'],
    [1000n, 'PRIME-A001'],
    [1998n, 'PRIME-A999'],
    [1999n, 'PRIME-B001'],
    [26973n, 'PRIME-Z999'],
    [26974n, 'PRIME-AA001'],
    [52947n, 'PRIME-AZ999'],
    [52948n, 'PRIME-BA001'],
  ])('formats %s as %s', (ordinal, expected) =>
    expect(formatMembershipNumber(ordinal)).toBe(expected),
  );
  it.each([0n, -1n])('rejects invalid ordinal %s', (ordinal) =>
    expect(() => formatMembershipNumber(ordinal)).toThrow('Invalid'),
  );
  it('produces unique well-formed codes across boundaries', () => {
    const codes = new Set<string>();
    for (let n = 1n; n <= 53000n; n++) {
      const code = formatMembershipNumber(n);
      expect(code).toMatch(/^PRIME-[A-Z]*[0-9]{3}$/);
      expect(code.endsWith('000')).toBe(false);
      codes.add(code);
    }
    expect(codes.size).toBe(53000);
  });
  it('uses the atomic persisted counter and skips occupied codes', async () => {
    let ordinal = 1n;
    const occupied = new Set(['PRIME-002']);
    const tx = {
      $queryRaw: jest.fn(async () => [{ value: ++ordinal }]),
      membership: {
        findUnique: jest.fn(async ({ where }: { where: { number: string } }) =>
          occupied.has(where.number) ? { id: 'existing' } : null,
        ),
      },
    };
    expect(await nextMembershipNumber(tx as never)).toBe('PRIME-003');
    expect(await nextMembershipNumber(tx as never)).toBe('PRIME-004');
  });
});
