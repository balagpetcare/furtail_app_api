/**
 * Single source of truth for what a fundraising account's *verification*
 * (KYC / payout) status is allowed to gate.
 *
 * The product rule this encodes: fundraising verification exists to protect
 * the movement of money **out** of the platform, not to gate publishing or
 * collecting. Raising money is open to any authenticated owner of a valid
 * draft; only cashing out requires an approved verification.
 *
 * Callers must use these helpers rather than re-deriving status rules
 * inline, so a future status value can never accidentally start blocking
 * campaign creation again. Deliberately dependency-free (pure predicates,
 * no throwing) so it can be imported from anywhere without cycles — the
 * store owns the typed error it raises from `assertCanWithdrawFunds`.
 */

/** The only status that grants payout/withdrawal access. */
export const APPROVED_VERIFICATION_STATUS = 'VERIFIED';
export const ACCOUNT_MONEY_MOVEMENT_BLOCKED_STATUSES = ['SUSPENDED', 'DEACTIVATED'] as const;

export interface FundraisingAccountLike {
  status: string;
}

/**
 * Creating, saving, submitting for review, publishing and displaying a
 * campaign are **never** gated on verification status — nor on the mere
 * existence of a verification account row. An account that is absent,
 * DRAFT, PENDING, PENDING_REVIEW, UNDER_REVIEW, REQUIRES_UPDATE, or even
 * REJECTED (rejection only ever concerns payout/KYC eligibility) may still
 * run the full campaign lifecycle up to and including PENDING_REVIEW.
 *
 * Ownership, authentication, media ownership, location validation and
 * campaign moderation are enforced separately and are unaffected by this.
 */
export function canCreateOrSubmitCampaign(_account: FundraisingAccountLike | null): boolean {
  return !ACCOUNT_MONEY_MOVEMENT_BLOCKED_STATUSES.includes(
    (_account?.status ?? '')
      .trim()
      .toUpperCase() as (typeof ACCOUNT_MONEY_MOVEMENT_BLOCKED_STATUSES)[number],
  );
}

/**
 * Accepting donations is likewise never gated on the beneficiary's payout
 * verification — donors may fund an unverified campaign; the funds simply
 * cannot be withdrawn until verification is approved (see
 * [canWithdrawFunds]). Campaign-level donatability (status, deadline,
 * funding cap) is enforced separately by the store.
 */
export function canReceiveDonations(_account: FundraisingAccountLike | null): boolean {
  return !ACCOUNT_MONEY_MOVEMENT_BLOCKED_STATUSES.includes(
    (_account?.status ?? '')
      .trim()
      .toUpperCase() as (typeof ACCOUNT_MONEY_MOVEMENT_BLOCKED_STATUSES)[number],
  );
}

/**
 * Moving collected funds out — withdrawal, cash-out, payout execution, and
 * activating a payout destination — requires an approved verification. This
 * is the one place the verification status is genuinely load-bearing.
 */
export function canWithdrawFunds(account: FundraisingAccountLike | null): boolean {
  return account?.status === APPROVED_VERIFICATION_STATUS;
}

/**
 * Campaign moderation/lifecycle status and donation eligibility are
 * deliberately separate concerns. A campaign awaiting moderator review can
 * still be shown publicly and accept donations — moderation exists to
 * eventually approve/reject/publish it, not to hide it from donors or the
 * beneficiary's own supporters while that happens.
 *
 * Single source of truth for both "is this status publicly
 * visible/donatable" checks — every route/service must call these instead
 * of re-deriving a status allowlist inline, which is exactly how the public
 * feed/detail endpoints previously drifted out of sync with the donation
 * checkout gate.
 */
export const DONATION_ELIGIBLE_STATUSES = [
  'PENDING_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'ACTIVE',
] as const;

export const DONATION_BLOCKED_STATUSES = [
  'DRAFT',
  'REJECTED',
  'CANCELLED',
  'ARCHIVED',
  'SUSPENDED',
  'PAUSED',
  'FUNDED',
  'COMPLETED',
  'EXPIRED',
  'DELETED',
] as const;

/**
 * Publicly visible statuses are a superset of donation-eligible ones — a
 * campaign that finished successfully (FUNDED/COMPLETED), was paused, or
 * expired remains visible to donors/supporters for transparency even
 * though it no longer accepts new donations.
 */
export const PUBLIC_VISIBLE_STATUSES = [
  ...DONATION_ELIGIBLE_STATUSES,
  'PAUSED',
  'FUNDED',
  'COMPLETED',
  'EXPIRED',
] as const;

export interface CampaignDonationLike {
  status: string;
  endsAt: Date | null;
  deadline: Date | null;
  targetAmountMinor: bigint | null;
  raisedAmountMinor: bigint;
}

export function isPublicVisibleStatus(status: string): boolean {
  return (PUBLIC_VISIBLE_STATUSES as readonly string[]).includes(status);
}

export function isDonationEligibleStatus(status: string): boolean {
  return (DONATION_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

export function isCampaignExpired(
  campaign: Pick<CampaignDonationLike, 'endsAt' | 'deadline'>,
  now: Date,
): boolean {
  const end = campaign.endsAt ?? campaign.deadline;
  return end !== null && end.getTime() < now.getTime();
}

/**
 * The canonical `donationAllowed` computation — status-eligible, not past
 * its deadline, and not already fully funded. Never depends on the
 * beneficiary's KYC/payout verification status (see [canReceiveDonations]).
 */
export function isDonationAllowed(campaign: CampaignDonationLike, now: Date): boolean {
  if (!isDonationEligibleStatus(campaign.status)) return false;
  if (isCampaignExpired(campaign, now)) return false;
  if (campaign.targetAmountMinor && campaign.raisedAmountMinor >= campaign.targetAmountMinor) {
    return false;
  }
  return true;
}
