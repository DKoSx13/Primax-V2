import { matchesMembershipCode } from './membership-code';
it('legacy alias identifies only its original UUID', async () => {
  const tx = {
    membershipCodeAlias: {
      findUnique: jest.fn().mockResolvedValue({ membershipId: 'original' }),
    },
  };
  expect(
    await matchesMembershipCode(
      tx as never,
      { id: 'original', number: 'PRIME-A001' },
      'PRIM-001A',
    ),
  ).toBe(true);
  expect(
    await matchesMembershipCode(
      tx as never,
      { id: 'other', number: 'PRIME-A002' },
      'PRIM-001A',
    ),
  ).toBe(false);
  expect(await matchesMembershipCode(tx as never, null, 'PRIM-001A')).toBe(
    false,
  );
});
