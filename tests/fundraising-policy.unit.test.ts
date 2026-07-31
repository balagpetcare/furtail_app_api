import {
  canCreateOrSubmitCampaign,
  canReceiveDonations,
  canWithdrawFunds,
} from '../src/modules/fundraising/fundraising-policy';

/**
 * Locks in the product rule that fundraising verification protects money
 * leaving the platform, not raising it. If someone later reintroduces a
 * verification gate on campaign creation/submission or donation acceptance,
 * these fail.
 */
describe('fundraising verification policy', () => {
  // Every status the fundraising account can realistically be in, including
  // the "not onboarded at all" case.
  const nonApprovedStates = [
    null,
    { status: 'DRAFT' },
    { status: 'PENDING' },
    { status: 'PENDING_REVIEW' },
    { status: 'UNDER_REVIEW' },
    { status: 'REQUIRES_UPDATE' },
    { status: 'REJECTED' },
  ];

  describe('campaign create/submit', () => {
    it.each(nonApprovedStates)('is allowed for %j', (account) => {
      expect(canCreateOrSubmitCampaign(account)).toBe(true);
    });

    it('is allowed for an approved account', () => {
      expect(canCreateOrSubmitCampaign({ status: 'VERIFIED' })).toBe(true);
    });
  });

  describe('donation acceptance', () => {
    it.each(nonApprovedStates)('is allowed for %j', (account) => {
      expect(canReceiveDonations(account)).toBe(true);
    });

    it('is allowed for an approved account', () => {
      expect(canReceiveDonations({ status: 'VERIFIED' })).toBe(true);
    });
  });

  describe('withdrawal', () => {
    it.each(nonApprovedStates)('is blocked for %j', (account) => {
      expect(canWithdrawFunds(account)).toBe(false);
    });

    it('is allowed only for an approved (VERIFIED) account', () => {
      expect(canWithdrawFunds({ status: 'VERIFIED' })).toBe(true);
    });

    it('does not treat a lowercase or padded status as approved', () => {
      expect(canWithdrawFunds({ status: 'verified' })).toBe(false);
      expect(canWithdrawFunds({ status: ' VERIFIED ' })).toBe(false);
    });
  });
});
