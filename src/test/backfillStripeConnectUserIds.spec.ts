/**
 * Unit tests for backfillStripeConnectUserIds.ts
 *
 * Tests only the exported validateBackfill() pure-logic function.
 * No MongoDB connection, no Stripe API calls.
 */

import { validateBackfill, BackfillError, REPAIR_CONFIG, FailReason } from '../scripts/backfillStripeConnectUserIds';

const R = REPAIR_CONFIG;

// ─── Minimal User stub matching the shape validateBackfill() reads ────────────
function makeUser(overrides: {
  merchantStripeAccountId?: string | null;
  organizerStripeAccountId?: string | null;
} = {}): any {
  return {
    _id: R.targetUserId,
    email: 'test@example.com',
    role: 'USER',
    merchantStripeAccountId:  overrides.merchantStripeAccountId  ?? undefined,
    organizerStripeAccountId: overrides.organizerStripeAccountId ?? undefined,
  };
}

// ─── Valid metadata stubs ─────────────────────────────────────────────────────
const validMerchantMeta  = { skatriumUserId: R.merchant.expectedSkId,  skatriumRole: R.merchant.expectedRole  };
const validOrganizerMeta = { skatriumUserId: R.organizer.expectedSkId, skatriumRole: R.organizer.expectedRole };

// ─── Helper ──────────────────────────────────────────────────────────────────
async function expectFail(fn: () => Promise<any>, reason: FailReason) {
  let thrown: any = null;
  try { await fn(); } catch (e) { thrown = e; }
  expect(thrown).toBeInstanceOf(BackfillError);
  expect((thrown as BackfillError).reason).toBe(reason);
}

describe('validateBackfill — Stripe Connect User ID Backfill', () => {

  // ── USER_NOT_FOUND ──────────────────────────────────────────────────────────
  it('throws USER_NOT_FOUND when user is null', async () => {
    await expectFail(
      () => validateBackfill(null, validMerchantMeta, validOrganizerMeta,
        R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'USER_NOT_FOUND',
    );
  });

  // ── MERCHANT_OWNER_MISMATCH ─────────────────────────────────────────────────
  it('throws MERCHANT_OWNER_MISMATCH when merchant skatriumUserId is wrong', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser(), { ...validMerchantMeta, skatriumUserId: 'wrong_user_id' },
        validOrganizerMeta, R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'MERCHANT_OWNER_MISMATCH',
    );
  });

  // ── MERCHANT_ROLE_MISMATCH ──────────────────────────────────────────────────
  it('throws MERCHANT_ROLE_MISMATCH when merchant skatriumRole is wrong', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser(), { ...validMerchantMeta, skatriumRole: 'ORGANIZER' },
        validOrganizerMeta, R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'MERCHANT_ROLE_MISMATCH',
    );
  });

  // ── ORGANIZER_OWNER_MISMATCH ────────────────────────────────────────────────
  it('throws ORGANIZER_OWNER_MISMATCH when organizer skatriumUserId is wrong', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser(), validMerchantMeta,
        { ...validOrganizerMeta, skatriumUserId: 'different_user' },
        R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'ORGANIZER_OWNER_MISMATCH',
    );
  });

  // ── ORGANIZER_ROLE_MISMATCH ─────────────────────────────────────────────────
  it('throws ORGANIZER_ROLE_MISMATCH when organizer skatriumRole is wrong', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser(), validMerchantMeta,
        { ...validOrganizerMeta, skatriumRole: 'MARCHANT' },
        R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'ORGANIZER_ROLE_MISMATCH',
    );
  });

  // ── ACCOUNT_ID_COLLISION ────────────────────────────────────────────────────
  it('throws ACCOUNT_ID_COLLISION when merchant and organizer IDs are identical', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser(), validMerchantMeta, validOrganizerMeta,
        'acct_same', 'acct_same', R),
      'ACCOUNT_ID_COLLISION',
    );
  });

  // ── EXISTING_MAPPING_CONFLICT (merchant) ────────────────────────────────────
  it('throws EXISTING_MAPPING_CONFLICT when existing merchantStripeAccountId differs from target', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser({ merchantStripeAccountId: 'acct_unexpected' }),
        validMerchantMeta, validOrganizerMeta,
        R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'EXISTING_MAPPING_CONFLICT',
    );
  });

  // ── EXISTING_MAPPING_CONFLICT (organizer) ───────────────────────────────────
  it('throws EXISTING_MAPPING_CONFLICT when existing organizerStripeAccountId differs from target', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser({ organizerStripeAccountId: 'acct_unexpected' }),
        validMerchantMeta, validOrganizerMeta,
        R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'EXISTING_MAPPING_CONFLICT',
    );
  });

  // ── Happy path — fresh user (both fields unset) ─────────────────────────────
  it('returns WRITE/WRITE for a user with no existing mappings', async () => {
    const result = await validateBackfill(
      makeUser(), validMerchantMeta, validOrganizerMeta,
      R.merchant.stripeAccountId, R.organizer.stripeAccountId, R);

    expect(result.merchantAction).toBe('WRITE');
    expect(result.organizerAction).toBe('WRITE');
    expect(result.existingMerchantId).toBeNull();
    expect(result.existingOrganizerId).toBeNull();
  });

  // ── Idempotency — merchant already correct ──────────────────────────────────
  it('returns ALREADY_CORRECT for merchant when existing mapping matches target', async () => {
    const result = await validateBackfill(
      makeUser({ merchantStripeAccountId: R.merchant.stripeAccountId }),
      validMerchantMeta, validOrganizerMeta,
      R.merchant.stripeAccountId, R.organizer.stripeAccountId, R);

    expect(result.merchantAction).toBe('ALREADY_CORRECT');
    expect(result.organizerAction).toBe('WRITE');
  });

  // ── Idempotency — organizer already correct ─────────────────────────────────
  it('returns ALREADY_CORRECT for organizer when existing mapping matches target', async () => {
    const result = await validateBackfill(
      makeUser({ organizerStripeAccountId: R.organizer.stripeAccountId }),
      validMerchantMeta, validOrganizerMeta,
      R.merchant.stripeAccountId, R.organizer.stripeAccountId, R);

    expect(result.merchantAction).toBe('WRITE');
    expect(result.organizerAction).toBe('ALREADY_CORRECT');
  });

  // ── Idempotency — both already correct ─────────────────────────────────────
  it('returns ALREADY_CORRECT/ALREADY_CORRECT when both mappings already match', async () => {
    const result = await validateBackfill(
      makeUser({
        merchantStripeAccountId:  R.merchant.stripeAccountId,
        organizerStripeAccountId: R.organizer.stripeAccountId,
      }),
      validMerchantMeta, validOrganizerMeta,
      R.merchant.stripeAccountId, R.organizer.stripeAccountId, R);

    expect(result.merchantAction).toBe('ALREADY_CORRECT');
    expect(result.organizerAction).toBe('ALREADY_CORRECT');
  });

  // ── Missing metadata fields are treated as mismatches ──────────────────────
  it('throws MERCHANT_OWNER_MISMATCH when merchant metadata is empty', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser(), {}, validOrganizerMeta,
        R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'MERCHANT_OWNER_MISMATCH',
    );
  });

  it('throws ORGANIZER_OWNER_MISMATCH when organizer metadata is empty', async () => {
    await expectFail(
      () => validateBackfill(
        makeUser(), validMerchantMeta, {},
        R.merchant.stripeAccountId, R.organizer.stripeAccountId, R),
      'ORGANIZER_OWNER_MISMATCH',
    );
  });

  // ── REPAIR_CONFIG constants are sane ────────────────────────────────────────
  it('REPAIR_CONFIG has distinct merchant and organizer account IDs', () => {
    expect(R.merchant.stripeAccountId).not.toBe(R.organizer.stripeAccountId);
  });

  it('REPAIR_CONFIG merchant and organizer both reference the same userId', () => {
    expect(R.merchant.expectedSkId).toBe(R.organizer.expectedSkId);
    expect(R.merchant.expectedSkId).toBe(R.targetUserId);
  });
});
