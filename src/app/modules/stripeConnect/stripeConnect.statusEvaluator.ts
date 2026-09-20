import { StripeOnboardingStatus } from '../merchantProfile/merchantProfile.interface';

export interface StripeAccountTelemetry {
  onboardingStatus: StripeOnboardingStatus;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  transfersCapability: string;
  currentlyDue: string[];
  pastDue: string[];
  eventuallyDue: string[];
  disabledReason: string | null;
}

/**
 * Deterministically evaluates Stripe Account status based on requirements, capabilities, and telemetry.
 *
 * Rules:
 * 1. If disabled_reason is present:
 *    - 'requirements.past_due' -> RESTRICTED
 *    - any other reason ('rejected.fraud', 'rejected.other', 'listed', etc.) -> DISABLED
 * 2. Else if requirements.past_due array is non-empty -> RESTRICTED
 * 3. Else if capabilities.transfers === 'active' AND payouts_enabled === true -> READY
 * 4. Else if details_submitted === true -> UNDER_REVIEW
 * 5. Else if details_submitted === false -> ONBOARDING_REQUIRED
 * 6. Unexpected state -> STATUS_EVALUATION_ERROR
 */
export const evaluateStripeAccountStatus = (
  account: any,
): StripeAccountTelemetry => {
  const detailsSubmitted = Boolean(account?.details_submitted);
  const payoutsEnabled = Boolean(account?.payouts_enabled);
  const transfersCapability =
    typeof account?.capabilities?.transfers === 'string'
      ? account.capabilities.transfers
      : 'inactive';

  const currentlyDue = Array.isArray(account?.requirements?.currently_due)
    ? account.requirements.currently_due
    : [];
  const pastDue = Array.isArray(account?.requirements?.past_due)
    ? account.requirements.past_due
    : [];
  const eventuallyDue = Array.isArray(account?.requirements?.eventually_due)
    ? account.requirements.eventually_due
    : [];

  const disabledReason =
    typeof account?.requirements?.disabled_reason === 'string' &&
    account.requirements.disabled_reason.trim() !== ''
      ? account.requirements.disabled_reason
      : null;

  let onboardingStatus: StripeOnboardingStatus;

  try {
    if (!account || typeof account !== 'object') {
      console.error(
        `[StripeStatusEvaluator] Invalid account object passed to evaluator:`,
        account,
      );
      onboardingStatus = 'STATUS_EVALUATION_ERROR';
    } else if (disabledReason) {
      if (disabledReason === 'requirements.past_due') {
        onboardingStatus = 'RESTRICTED';
      } else {
        onboardingStatus = 'DISABLED';
      }
    } else if (pastDue.length > 0) {
      onboardingStatus = 'RESTRICTED';
    } else if (transfersCapability === 'active' && payoutsEnabled) {
      onboardingStatus = 'READY';
    } else if (detailsSubmitted) {
      onboardingStatus = 'UNDER_REVIEW';
    } else if (account?.details_submitted === false) {
      onboardingStatus = 'ONBOARDING_REQUIRED';
    } else {
      console.error(
        `[StripeStatusEvaluator] Unexpected account state for account ID: ${account?.id}`,
      );
      onboardingStatus = 'STATUS_EVALUATION_ERROR';
    }
  } catch (err: any) {
    console.error(
      `[StripeStatusEvaluator] Evaluation exception for account ID ${account?.id}: ${err?.message}`,
    );
    onboardingStatus = 'STATUS_EVALUATION_ERROR';
  }

  return {
    onboardingStatus,
    detailsSubmitted,
    payoutsEnabled,
    transfersCapability,
    currentlyDue,
    pastDue,
    eventuallyDue,
    disabledReason,
  };
};
