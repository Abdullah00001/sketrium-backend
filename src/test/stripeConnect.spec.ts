import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../app';
import config from '../app/config';
import User from '../app/modules/user/user.model';
import { MerchantProfile } from '../app/modules/merchantProfile/merchantProfile.model';
import { OrganizerProfile } from '../app/modules/organizerProfile/organizerProfile.model';
import { setStripeClient } from '../app/utils/stripeClient';
import { evaluateStripeAccountStatus } from '../app/modules/stripeConnect/stripeConnect.statusEvaluator';
import { onboardingTokenStore } from '../app/modules/stripeConnect/stripeConnect.tokenStore';
import { stripeConnectService } from '../app/modules/stripeConnect/stripeConnect.service';
import {
  canAccessMerchantRole,
  canAccessOrganizerRole,
} from '../app/modules/stripeConnect/stripeConnect.authorization';

describe('Stripe Connect Seller / Organizer Onboarding (Phase 2 Audit Strengthened Tests)', () => {
  let mockStripe: any;
  let subscribedUserToken: string;
  let unsubscribedUserToken: string;
  let djUserToken: string;

  let subscribedUserId: string;
  let unsubscribedUserId: string;
  let djUserId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.database_url as string);
    }

    await User.deleteMany({ email: /.*@connecttest\.com$/ });

    const subUser = await User.create({
      email: 'subscribed_merchant@connecttest.com',
      password: 'password123',
      fullName: 'Subscribed Seller',
      phoneNumber: '1234567890',
      role: 'USER',
      isPremium: true,
      subscription: { status: 'active' },
      country: 'US',
    });
    subscribedUserId = subUser._id.toString();
    subscribedUserToken = jwt.sign(
      { id: subscribedUserId, role: 'USER' },
      config.jwt.jwt_access_secret as string,
    );

    const unsubUser = await User.create({
      email: 'unsubscribed@connecttest.com',
      password: 'password123',
      fullName: 'Unsubscribed User',
      phoneNumber: '1234567891',
      role: 'USER',
      isPremium: false,
      subscription: { status: 'none' },
      country: 'US',
    });
    unsubscribedUserId = unsubUser._id.toString();
    unsubscribedUserToken = jwt.sign(
      { id: unsubscribedUserId, role: 'USER' },
      config.jwt.jwt_access_secret as string,
    );

    const djUser = await User.create({
      email: 'dj_user@connecttest.com',
      password: 'password123',
      fullName: 'DJ User',
      phoneNumber: '1234567892',
      role: 'KAATEDJ',
      isPremium: false,
      country: 'US',
    });
    djUserId = djUser._id.toString();
    djUserToken = jwt.sign(
      { id: djUserId, role: 'KAATEDJ' },
      config.jwt.jwt_access_secret as string,
    );

    // Set token secret for tests
    (config.stripe as any).connect_token_secret = 'test_mandatory_token_secret_123';
  }, 30000);

  afterAll(async () => {
    await MerchantProfile.deleteMany({
      user: { $in: [subscribedUserId, unsubscribedUserId, djUserId] },
    });
    await OrganizerProfile.deleteMany({
      user: { $in: [subscribedUserId, unsubscribedUserId, djUserId] },
    });
    await User.deleteMany({
      _id: { $in: [subscribedUserId, unsubscribedUserId, djUserId] },
    });
    await mongoose.disconnect();
  }, 30000);

  beforeEach(() => {
    onboardingTokenStore.clear();

    mockStripe = {
      accounts: {
        search: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockImplementation(async (data: any, options: any) => {
          return {
            id: `acct_mock_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            details_submitted: false,
            payouts_enabled: false,
            capabilities: { transfers: 'inactive' },
            requirements: {
              currently_due: ['individual.ssn'],
              past_due: [],
              eventually_due: [],
              disabled_reason: null,
            },
            metadata: data.metadata,
          };
        }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'acct_mock_existing',
          details_submitted: true,
          payouts_enabled: true,
          capabilities: { transfers: 'active' },
          requirements: {
            currently_due: [],
            past_due: [],
            eventually_due: [],
            disabled_reason: null,
          },
        }),
      },
      accountLinks: {
        create: jest.fn().mockImplementation(async (data: any) => {
          return {
            url: `https://connect.stripe.com/setup/s/${data.account}`,
          };
        }),
      },
    };

    setStripeClient(mockStripe);
  });

  describe('Subscription Authorization & Role Isolation', () => {
    it('1. Inactive Subscription Rejection: Unsubscribed user cannot onboard merchant role (returns 402)', async () => {
      const res = await request(app)
        .post('/api/v1/connect/merchant/onboard')
        .set('Authorization', `Bearer ${unsubscribedUserToken}`);

      expect(res.status).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Active subscription required/i);
    });

    it('2. DJ Bypass: DJ user without subscription is rejected from seller onboarding', async () => {
      const res = await request(app)
        .post('/api/v1/connect/merchant/onboard')
        .set('Authorization', `Bearer ${djUserToken}`);

      expect([402, 403]).toContain(res.status);
    });

    it('3. Admin Bypass: Admin user can access seller roles even without isPremium', () => {
      const adminUserFake: any = { role: 'admin', isPremium: false };
      expect(canAccessMerchantRole(adminUserFake)).toBe(true);
      expect(canAccessOrganizerRole(adminUserFake)).toBe(true);
    });

    it('4. Independent Merchant & Organizer Profiles: Same user can independently have both profiles', async () => {
      await MerchantProfile.deleteMany({ user: subscribedUserId });
      await OrganizerProfile.deleteMany({ user: subscribedUserId });

      const resMerchant = await request(app)
        .post('/api/v1/connect/merchant/onboard')
        .set('Authorization', `Bearer ${subscribedUserToken}`);
      expect(resMerchant.status).toBe(200);

      const resOrganizer = await request(app)
        .post('/api/v1/connect/organizer/onboard')
        .set('Authorization', `Bearer ${subscribedUserToken}`);
      expect(resOrganizer.status).toBe(200);

      const mProfile = await MerchantProfile.findOne({ user: subscribedUserId });
      const oProfile = await OrganizerProfile.findOne({ user: subscribedUserId });

      expect(mProfile).toBeDefined();
      expect(oProfile).toBeDefined();
      expect(mProfile!.stripeConnectedAccountId).toBeDefined();
      expect(oProfile!.stripeConnectedAccountId).toBeDefined();
      expect(mProfile!.stripeConnectedAccountId).not.toBe(
        oProfile!.stripeConnectedAccountId,
      );
    });
  });

  describe('Idempotency State Machine, Concurrency & Recovery', () => {
    it('5a. Concurrent NOT_STARTED requests: Promise.all concurrency test', async () => {
      await MerchantProfile.deleteMany({ user: subscribedUserId });
      const profile = await stripeConnectService.getOrCreateProfile(
        subscribedUserId,
        'MARCHANT',
      );

      const results = await Promise.all([
        stripeConnectService.acquireCreationOperation(profile._id!.toString(), 'MARCHANT'),
        stripeConnectService.acquireCreationOperation(profile._id!.toString(), 'MARCHANT'),
      ]);

      const owners = results.filter((r) => r.isOwner);
      expect(owners.length).toBe(1); // Exactly 1 winner
      expect(results[0].profile.stripeIdempotencyKey).toBe(
        results[1].profile.stripeIdempotencyKey,
      ); // Both observe same idempotency key
    });

    it('5b. Concurrent FAILED requests: Promise.all concurrency test generates new key pair for 1 winner', async () => {
      await MerchantProfile.deleteMany({ user: subscribedUserId });
      const profile = await MerchantProfile.create({
        user: subscribedUserId,
        accountCreationStatus: 'FAILED',
        accountCreationOperationId: 'failed_op_old',
        stripeIdempotencyKey: 'skatrium_connect_op_failed_op_old',
      });

      const results = await Promise.all([
        stripeConnectService.acquireCreationOperation(profile._id.toString(), 'MARCHANT'),
        stripeConnectService.acquireCreationOperation(profile._id.toString(), 'MARCHANT'),
      ]);

      const owners = results.filter((r) => r.isOwner);
      expect(owners.length).toBe(1);
      expect(results[0].profile.stripeIdempotencyKey).toBe(
        results[1].profile.stripeIdempotencyKey,
      );
      expect(results[0].profile.stripeIdempotencyKey).not.toBe(
        'skatrium_connect_op_failed_op_old',
      );
    });

    it('5c. RECOVERY_REQUIRED & Stale CREATING Retry: Preserves exact same idempotency key across retries', async () => {
      await MerchantProfile.deleteMany({ user: subscribedUserId });
      const originalOpId = 'op_recovery_test_999';
      const originalKey = `skatrium_connect_op_${originalOpId}`;

      const profile = await MerchantProfile.create({
        user: subscribedUserId,
        accountCreationStatus: 'RECOVERY_REQUIRED',
        accountCreationOperationId: originalOpId,
        stripeIdempotencyKey: originalKey,
      });

      const { isOwner, profile: acquired } =
        await stripeConnectService.acquireCreationOperation(
          profile._id.toString(),
          'MARCHANT',
        );

      expect(isOwner).toBe(true);
      expect(acquired.accountCreationStatus).toBe('CREATING');
      expect(acquired.accountCreationOperationId).toBe(originalOpId);
      expect(acquired.stripeIdempotencyKey).toBe(originalKey); // Preserved
    });

    it('6. Metadata Reconciliation & Multiple-Account Collision Detection', async () => {
      await MerchantProfile.deleteMany({ user: subscribedUserId });
      mockStripe.accounts.search.mockResolvedValueOnce({
        data: [{ id: 'acct_1' }, { id: 'acct_2' }],
      });

      const profile = await stripeConnectService.getOrCreateProfile(
        subscribedUserId,
        'MARCHANT',
      );

      await expect(
        stripeConnectService.reconcileOrRecoverAccount(profile, 'MARCHANT'),
      ).rejects.toThrow(/Multiple Stripe accounts match/i);

      const updatedProfile = await MerchantProfile.findById(profile._id);
      expect(updatedProfile!.accountCreationStatus).toBe(
        'MANUAL_RECONCILIATION_REQUIRED',
      );
    });

    it('7. Stale CREATING Lock Recovery: Reclaims operation if older than timeout', async () => {
      await MerchantProfile.deleteMany({ user: subscribedUserId });
      const staleDate = new Date(Date.now() - 360000); // 6 mins ago
      const profile = await MerchantProfile.create({
        user: subscribedUserId,
        accountCreationStatus: 'CREATING',
        accountCreationStartedAt: staleDate,
        accountCreationOperationId: 'old_op_123',
        stripeIdempotencyKey: 'skatrium_connect_op_old_op_123',
      });

      const { isOwner, profile: reclaimed } =
        await stripeConnectService.acquireCreationOperation(
          profile._id.toString(),
          'MARCHANT',
        );

      expect(isOwner).toBe(true);
      expect(reclaimed.accountCreationStatus).toBe('CREATING');
      expect(reclaimed.stripeIdempotencyKey).toBe(
        'skatrium_connect_op_old_op_123',
      );
    });
  });

  describe('Single-Use Onboarding Tokens, Concurrency & Security', () => {
    it('8a. Concurrent GETDEL Token Consumption (Promise.all)', async () => {
      const token = onboardingTokenStore.createToken(
        subscribedUserId,
        'MARCHANT',
        'profile_123',
      );

      const results = await Promise.all([
        Promise.resolve().then(() => onboardingTokenStore.consumeToken(token)),
        Promise.resolve().then(() => onboardingTokenStore.consumeToken(token)),
      ]);

      const validConsumptions = results.filter((r) => r !== null);
      expect(validConsumptions.length).toBe(1); // Only 1 succeeded
    });

    it('8b. Missing STRIPE_CONNECT_TOKEN_SECRET throws Configuration Error', () => {
      const originalSecret = (config.stripe as any).connect_token_secret;
      (config.stripe as any).connect_token_secret = '';

      expect(() => {
        onboardingTokenStore.createToken(subscribedUserId, 'MARCHANT', 'profile_123');
      }).toThrow(/STRIPE_CONNECT_TOKEN_SECRET is missing and mandatory/i);

      (config.stripe as any).connect_token_secret = originalSecret;
    });

    it('9. Invalid / Tampered Token Signature Rejection', async () => {
      const token = onboardingTokenStore.createToken(
        subscribedUserId,
        'MARCHANT',
        'profile_123',
      );
      const tamperedToken = token + 'tampered';

      const consumed = onboardingTokenStore.consumeToken(tamperedToken);
      expect(consumed).toBeNull();
    });

    it('10. Handle Return Endpoint Consumes Token & Redirects', async () => {
      const token = onboardingTokenStore.createToken(
        subscribedUserId,
        'MARCHANT',
        'profile_123',
      );

      const res = await request(app).get(`/api/v1/connect/return?token=${token}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/stripe-connect-callback/);
    });

    it('11. Reuse of Consumed Token on Return Endpoint Returns Error', async () => {
      const token = onboardingTokenStore.createToken(
        subscribedUserId,
        'MARCHANT',
        'profile_123',
      );

      await request(app).get(`/api/v1/connect/return?token=${token}`);

      const res = await request(app).get(`/api/v1/connect/return?token=${token}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid, expired, or already consumed/i);
    });
  });

  describe('Deterministic Status Evaluator Mapping Matrix', () => {
    it('12. READY: transfers capability active & payouts_enabled true', () => {
      const account: any = {
        id: 'acct_ready',
        details_submitted: true,
        payouts_enabled: true,
        capabilities: { transfers: 'active' },
        requirements: { past_due: [], disabled_reason: null },
      };
      const result = evaluateStripeAccountStatus(account);
      expect(result.onboardingStatus).toBe('READY');
      expect(result.payoutsEnabled).toBe(true);
      expect(result.transfersCapability).toBe('active');
    });

    it('13. UNDER_REVIEW: details_submitted true, capabilities transfers inactive/pending', () => {
      const account: any = {
        id: 'acct_review',
        details_submitted: true,
        payouts_enabled: false,
        capabilities: { transfers: 'pending' },
        requirements: { past_due: [], disabled_reason: null },
      };
      const result = evaluateStripeAccountStatus(account);
      expect(result.onboardingStatus).toBe('UNDER_REVIEW');
    });

    it('14. ONBOARDING_REQUIRED: details_submitted false', () => {
      const account: any = {
        id: 'acct_onboarding',
        details_submitted: false,
        payouts_enabled: false,
        capabilities: { transfers: 'inactive' },
        requirements: { past_due: [], disabled_reason: null },
      };
      const result = evaluateStripeAccountStatus(account);
      expect(result.onboardingStatus).toBe('ONBOARDING_REQUIRED');
    });

    it('15. RESTRICTED: requirements.past_due non-empty or disabled_reason=requirements.past_due', () => {
      const accountPastDue: any = {
        id: 'acct_past_due',
        details_submitted: true,
        payouts_enabled: false,
        capabilities: { transfers: 'inactive' },
        requirements: { past_due: ['individual.verification.document'], disabled_reason: null },
      };
      expect(evaluateStripeAccountStatus(accountPastDue).onboardingStatus).toBe(
        'RESTRICTED',
      );

      const accountDisabledPastDue: any = {
        id: 'acct_disabled_past_due',
        details_submitted: true,
        payouts_enabled: false,
        capabilities: { transfers: 'inactive' },
        requirements: {
          past_due: [],
          disabled_reason: 'requirements.past_due',
        },
      };
      expect(
        evaluateStripeAccountStatus(accountDisabledPastDue).onboardingStatus,
      ).toBe('RESTRICTED');
    });

    it('16. DISABLED: disabled_reason present (e.g. rejected.fraud)', () => {
      const accountFraud: any = {
        id: 'acct_fraud',
        details_submitted: true,
        payouts_enabled: false,
        capabilities: { transfers: 'inactive' },
        requirements: { past_due: [], disabled_reason: 'rejected.fraud' },
      };
      expect(evaluateStripeAccountStatus(accountFraud).onboardingStatus).toBe(
        'DISABLED',
      );
    });

    it('17. Unexpected Stripe Account state returns STATUS_EVALUATION_ERROR without defaulting to ONBOARDING_REQUIRED', () => {
      const malformedAccount: any = null; // Forces exception in evaluator
      const result = evaluateStripeAccountStatus(malformedAccount);
      expect(result.onboardingStatus).toBe('STATUS_EVALUATION_ERROR');
    });
  });

  describe('API Status Endpoints', () => {
    it('18. Merchant & Organizer Status Endpoints Return Telemetry', async () => {
      const resM = await request(app)
        .get('/api/v1/connect/merchant/status')
        .set('Authorization', `Bearer ${subscribedUserToken}`);

      expect(resM.status).toBe(200);
      expect(resM.body.data.role).toBe('MARCHANT');
      expect(resM.body.data.onboardingStatus).toBeDefined();

      const resO = await request(app)
        .get('/api/v1/connect/organizer/status')
        .set('Authorization', `Bearer ${subscribedUserToken}`);

      expect(resO.status).toBe(200);
      expect(resO.body.data.role).toBe('ORGANIZER');
      expect(resO.body.data.onboardingStatus).toBeDefined();
    });
  });
});
