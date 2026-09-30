/**
 * ONE-TIME PRODUCTION DATA REPAIR: Stripe Connect User Account ID Backfill
 *
 * Populates merchantStripeAccountId and organizerStripeAccountId on the target
 * User document after verifying Stripe account ownership metadata.
 *
 * Usage:
 *   DRY RUN (default — no DB writes):
 *     npx ts-node -r tsconfig-paths/register src/scripts/backfillStripeConnectUserIds.ts --dry-run
 *
 *   APPLY (performs the validated write):
 *     npx ts-node -r tsconfig-paths/register src/scripts/backfillStripeConnectUserIds.ts --apply
 *
 *   Or via npm:
 *     npm run backfill:stripe-connect -- --dry-run
 *     npm run backfill:stripe-connect -- --apply
 */

import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// ─── Load environment before any config imports ──────────────────────────────
dotenv.config({ path: path.join(process.cwd(), '.env') });

import config from '../app/config';
import User from '../app/modules/user/user.model';
import { getStripeClient } from '../app/utils/stripeClient';

// ============================================================
// APPROVED REPAIR TARGETS  (only these values will ever be written)
// ============================================================
export const REPAIR_CONFIG = {
  targetUserId: '6a716168aac23c52e46aab8b',
  merchant: {
    stripeAccountId: 'acct_1UHjFuPkiJFdtARd',
    expectedSkId:   '6a716168aac23c52e46aab8b',
    expectedRole:   'MARCHANT',
  },
  organizer: {
    stripeAccountId: 'acct_1UILrxBAt9q9UVH6',
    expectedSkId:   '6a716168aac23c52e46aab8b',
    expectedRole:   'ORGANIZER',
  },
} as const;

// ─── Failure codes ───────────────────────────────────────────────────────────
export type FailReason =
  | 'USER_NOT_FOUND'
  | 'MERCHANT_ACCOUNT_NOT_FOUND'
  | 'ORGANIZER_ACCOUNT_NOT_FOUND'
  | 'MERCHANT_OWNER_MISMATCH'
  | 'ORGANIZER_OWNER_MISMATCH'
  | 'MERCHANT_ROLE_MISMATCH'
  | 'ORGANIZER_ROLE_MISMATCH'
  | 'ACCOUNT_ID_COLLISION'
  | 'EXISTING_MAPPING_CONFLICT'
  | 'DATABASE_VALIDATION_FAILURE';

export class BackfillError extends Error {
  constructor(
    public readonly reason: FailReason,
    public readonly detail: string,
  ) {
    super(`${reason}: ${detail}`);
    this.name = 'BackfillError';
  }
}

// ─── Core validation + write logic (exported for unit testing) ───────────────
export type ActionType = 'WRITE' | 'ALREADY_CORRECT' | 'CONFLICT';

export interface BackfillResult {
  merchantAction:  ActionType;
  organizerAction: ActionType;
  userEmail:       string;
  existingMerchantId:  string | null;
  existingOrganizerId: string | null;
}

/**
 * Validates the Stripe accounts against the repair config and the existing User
 * state. Does NOT write anything. Throws BackfillError on any violation.
 */
export async function validateBackfill(
  user: (Awaited<ReturnType<typeof User.findById>> & { merchantStripeAccountId?: string; organizerStripeAccountId?: string }) | null,
  merchantMeta: Record<string, string>,
  organizerMeta: Record<string, string>,
  merchantAccountId: string,
  organizerAccountId: string,
  R: typeof REPAIR_CONFIG,
): Promise<BackfillResult> {
  if (!user) {
    throw new BackfillError('USER_NOT_FOUND',
      `No User document found with _id = ${R.targetUserId}`);
  }

  // Merchant metadata checks
  if (merchantMeta.skatriumUserId !== R.merchant.expectedSkId) {
    throw new BackfillError('MERCHANT_OWNER_MISMATCH',
      `metadata.skatriumUserId "${merchantMeta.skatriumUserId}" !== "${R.merchant.expectedSkId}"`);
  }
  if (merchantMeta.skatriumRole !== R.merchant.expectedRole) {
    throw new BackfillError('MERCHANT_ROLE_MISMATCH',
      `metadata.skatriumRole "${merchantMeta.skatriumRole}" !== "${R.merchant.expectedRole}"`);
  }

  // Organizer metadata checks
  if (organizerMeta.skatriumUserId !== R.organizer.expectedSkId) {
    throw new BackfillError('ORGANIZER_OWNER_MISMATCH',
      `metadata.skatriumUserId "${organizerMeta.skatriumUserId}" !== "${R.organizer.expectedSkId}"`);
  }
  if (organizerMeta.skatriumRole !== R.organizer.expectedRole) {
    throw new BackfillError('ORGANIZER_ROLE_MISMATCH',
      `metadata.skatriumRole "${organizerMeta.skatriumRole}" !== "${R.organizer.expectedRole}"`);
  }

  // Account ID collision check
  if (merchantAccountId === organizerAccountId) {
    throw new BackfillError('ACCOUNT_ID_COLLISION',
      `Merchant and Organizer account IDs are identical: ${merchantAccountId}`);
  }

  // Existing mapping: idempotency vs conflict
  const existingMerchant  = user.merchantStripeAccountId ?? null;
  const existingOrganizer = user.organizerStripeAccountId ?? null;

  let merchantAction:  ActionType = 'WRITE';
  let organizerAction: ActionType = 'WRITE';

  if (existingMerchant) {
    merchantAction = existingMerchant === R.merchant.stripeAccountId
      ? 'ALREADY_CORRECT' : 'CONFLICT';
  }
  if (existingOrganizer) {
    organizerAction = existingOrganizer === R.organizer.stripeAccountId
      ? 'ALREADY_CORRECT' : 'CONFLICT';
  }

  if (merchantAction === 'CONFLICT') {
    throw new BackfillError('EXISTING_MAPPING_CONFLICT',
      `User.merchantStripeAccountId is "${existingMerchant}" which differs from ` +
      `approved target "${R.merchant.stripeAccountId}". Manual investigation required.`);
  }
  if (organizerAction === 'CONFLICT') {
    throw new BackfillError('EXISTING_MAPPING_CONFLICT',
      `User.organizerStripeAccountId is "${existingOrganizer}" which differs from ` +
      `approved target "${R.organizer.stripeAccountId}". Manual investigation required.`);
  }

  return {
    merchantAction,
    organizerAction,
    userEmail:            (user as any).email,
    existingMerchantId:   existingMerchant,
    existingOrganizerId:  existingOrganizer,
  };
}

// ─── CLI entrypoint ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args       = process.argv.slice(2);
  const isDryRun   = !args.includes('--apply');
  const isExplicit = args.includes('--dry-run') || args.includes('--apply');

  if (!isExplicit) {
    console.warn('⚠️  No mode flag provided. Defaulting to DRY RUN.');
    console.warn('   Pass --apply to write, or --dry-run to suppress this warning.\n');
  }

  const line = (msg: string) => console.log(msg);

  line('════════════════════════════════════════════════════════');
  line(' Stripe Connect User Account ID Backfill');
  line(isDryRun
    ? ' MODE: DRY RUN — no writes will be performed'
    : ' MODE: APPLY — validated writes will be performed');
  line('════════════════════════════════════════════════════════\n');

  // Connect
  if (!config.database_url) {
    console.error('❌ DATABASE_URL not set in environment. Aborting.');
    process.exit(1);
  }
  line('Connecting to database...');
  await mongoose.connect(config.database_url as string);
  line('Database connected.\n');

  const stripe = getStripeClient();
  const R      = REPAIR_CONFIG;

  // ── Fetch User ─────────────────────────────────────────────────────────────
  line(`Target User: ${R.targetUserId}`);
  const user = await User.findById(new Types.ObjectId(R.targetUserId));

  // ── Fetch Merchant Stripe account ──────────────────────────────────────────
  line(`\nMerchant:`);
  line(`  Stripe Account:  ${R.merchant.stripeAccountId}`);

  let merchantAccount: any;
  try {
    merchantAccount = await stripe.accounts.retrieve(R.merchant.stripeAccountId);
  } catch (err: any) {
    console.error(`\n❌ BACKFILL ABORTED — MERCHANT_ACCOUNT_NOT_FOUND`);
    console.error(`   stripe.accounts.retrieve(${R.merchant.stripeAccountId}) failed: ${err.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (merchantAccount.deleted) {
    console.error(`\n❌ BACKFILL ABORTED — MERCHANT_ACCOUNT_NOT_FOUND`);
    console.error(`   Stripe account ${R.merchant.stripeAccountId} is marked deleted.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const mMeta: Record<string, string> = merchantAccount.metadata ?? {};
  line(`  metadata.skatriumUserId: ${mMeta.skatriumUserId ?? '(missing)'}  → ${mMeta.skatriumUserId === R.merchant.expectedSkId ? 'PASS ✓' : 'FAIL ✗'}`);
  line(`  metadata.skatriumRole:   ${mMeta.skatriumRole   ?? '(missing)'}  → ${mMeta.skatriumRole   === R.merchant.expectedRole ? 'PASS ✓' : 'FAIL ✗'}`);

  // ── Fetch Organizer Stripe account ─────────────────────────────────────────
  line(`\nOrganizer:`);
  line(`  Stripe Account:  ${R.organizer.stripeAccountId}`);

  let organizerAccount: any;
  try {
    organizerAccount = await stripe.accounts.retrieve(R.organizer.stripeAccountId);
  } catch (err: any) {
    console.error(`\n❌ BACKFILL ABORTED — ORGANIZER_ACCOUNT_NOT_FOUND`);
    console.error(`   stripe.accounts.retrieve(${R.organizer.stripeAccountId}) failed: ${err.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (organizerAccount.deleted) {
    console.error(`\n❌ BACKFILL ABORTED — ORGANIZER_ACCOUNT_NOT_FOUND`);
    console.error(`   Stripe account ${R.organizer.stripeAccountId} is marked deleted.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const oMeta: Record<string, string> = organizerAccount.metadata ?? {};
  line(`  metadata.skatriumUserId: ${oMeta.skatriumUserId ?? '(missing)'}  → ${oMeta.skatriumUserId === R.organizer.expectedSkId ? 'PASS ✓' : 'FAIL ✗'}`);
  line(`  metadata.skatriumRole:   ${oMeta.skatriumRole   ?? '(missing)'}  → ${oMeta.skatriumRole   === R.organizer.expectedRole ? 'PASS ✓' : 'FAIL ✗'}`);

  // ── Run validation logic ───────────────────────────────────────────────────
  let result: BackfillResult;
  try {
    result = await validateBackfill(
      user, mMeta, oMeta,
      R.merchant.stripeAccountId,
      R.organizer.stripeAccountId,
      R,
    );
  } catch (err: any) {
    if (err instanceof BackfillError) {
      console.error(`\n❌ BACKFILL ABORTED — ${err.reason}`);
      console.error(`   ${err.detail}`);
      console.error('\n   ZERO MongoDB writes were performed.');
    } else {
      console.error('\n❌ Unexpected validation error:', err);
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── Report existing state ──────────────────────────────────────────────────
  line(`\nUser found: ${result.userEmail}`);
  line(`\nCurrent User mappings:`);
  line(`  merchantStripeAccountId:  ${result.existingMerchantId  ?? '(not set)'}`);
  line(`  organizerStripeAccountId: ${result.existingOrganizerId ?? '(not set)'}`);
  line('');
  line(`Merchant action:  ${result.merchantAction}`);
  line(`Organizer action: ${result.organizerAction}`);

  // ── Both already correct → idempotent exit ────────────────────────────────
  if (result.merchantAction === 'ALREADY_CORRECT' && result.organizerAction === 'ALREADY_CORRECT') {
    line('\n✅ Both mappings are already correct. No write required.');
    line('\n────────────────────────────────────────────────────────');
    line('BACKFILL SUCCESSFUL — already idempotent, no writes needed.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── Dry-run gate ───────────────────────────────────────────────────────────
  if (isDryRun) {
    line('\n────────────────────────────────────────────────────────');
    line('WOULD UPDATE User document:');
    if (result.merchantAction === 'WRITE') {
      line(`  merchantStripeAccountId  ← "${R.merchant.stripeAccountId}"`);
    } else {
      line(`  merchantStripeAccountId  ← (already correct, no change)`);
    }
    if (result.organizerAction === 'WRITE') {
      line(`  organizerStripeAccountId ← "${R.organizer.stripeAccountId}"`);
    } else {
      line(`  organizerStripeAccountId ← (already correct, no change)`);
    }
    line('\nDRY RUN — NO DATABASE CHANGES');
    line('Run with --apply to perform the write.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── Apply — atomic $set ────────────────────────────────────────────────────
  const updateFields: Record<string, string> = {};
  if (result.merchantAction  === 'WRITE') updateFields['merchantStripeAccountId']  = R.merchant.stripeAccountId;
  if (result.organizerAction === 'WRITE') updateFields['organizerStripeAccountId'] = R.organizer.stripeAccountId;

  line('\nApplying atomic update...');
  const updateResult = await User.findByIdAndUpdate(
    new Types.ObjectId(R.targetUserId),
    { $set: updateFields },
    { new: false },
  );

  if (!updateResult) {
    console.error('\n❌ BACKFILL ABORTED — DATABASE_VALIDATION_FAILURE');
    console.error('   findByIdAndUpdate returned null — User may have been deleted mid-flight.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── Post-write verification ────────────────────────────────────────────────
  line('Verifying written values...');
  const verified = await User.findById(new Types.ObjectId(R.targetUserId));
  if (!verified) {
    console.error('\n❌ BACKFILL ABORTED — DATABASE_VALIDATION_FAILURE');
    console.error('   Cannot re-read User after update for verification.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const mOk = verified.merchantStripeAccountId  === R.merchant.stripeAccountId;
  const oOk = verified.organizerStripeAccountId === R.organizer.stripeAccountId;

  line(`  merchantStripeAccountId  = "${verified.merchantStripeAccountId}"  → ${mOk ? 'VERIFIED ✓' : 'MISMATCH ✗'}`);
  line(`  organizerStripeAccountId = "${verified.organizerStripeAccountId}" → ${oOk ? 'VERIFIED ✓' : 'MISMATCH ✗'}`);

  if (!mOk || !oOk) {
    console.error('\n❌ BACKFILL ABORTED — DATABASE_VALIDATION_FAILURE');
    console.error('   Post-write verification failed — stored values do not match expected account IDs.');
    await mongoose.disconnect();
    process.exit(1);
  }

  line('\n────────────────────────────────────────────────────────');
  line('BACKFILL SUCCESSFUL');
  line(`  User ${R.targetUserId} updated.`);
  line(`  merchantStripeAccountId  = ${R.merchant.stripeAccountId}`);
  line(`  organizerStripeAccountId = ${R.organizer.stripeAccountId}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Unexpected fatal error:', err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
