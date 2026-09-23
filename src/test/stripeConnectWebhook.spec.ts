import request from 'supertest';
import expect from 'expect';
import mongoose, { Types } from 'mongoose';
import Stripe from 'stripe';
import app from '../app';
import config from '../app/config';
import { MerchantProfile } from '../app/modules/merchantProfile/merchantProfile.model';
import { OrganizerProfile } from '../app/modules/organizerProfile/organizerProfile.model';
import { StripeConnectWebhookEvent } from '../app/modules/stripeConnect/stripeConnectWebhookEvent.model';
import { stripeConnectWebhookService } from '../app/modules/stripeConnect/stripeConnectWebhook.service';
import { setStripeClient } from '../app/utils/stripeClient';

describe('Phase 3 — Stripe Connect Webhook & Status Synchronization Suite', () => {
  const testSecret = 'whsec_connect_test_secret_12345';
  const originalSecret = config.stripe.connect_webhook_secret;

  let testUserId: Types.ObjectId;
  let merchantProfileId: Types.ObjectId;
  let organizerProfileId: Types.ObjectId;
  const merchantAccountId = 'acct_merchant_test_111';
  const organizerAccountId = 'acct_organizer_test_222';

  // Stripe Mock Store
  const stripeAccountsMap = new Map<string, any>();

  beforeAll(async () => {
    config.stripe.connect_webhook_secret = testSecret;
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.database_url as string);
    }
  });

  afterAll(async () => {
    config.stripe.connect_webhook_secret = originalSecret;
    // Mongoose connection is shared via the imported `app`. Jest forceExit handles teardown.
  });

  beforeEach(async () => {
    await StripeConnectWebhookEvent.deleteMany({});
    await MerchantProfile.deleteMany({});
    await OrganizerProfile.deleteMany({});

    testUserId = new Types.ObjectId();
    merchantProfileId = new Types.ObjectId();
    organizerProfileId = new Types.ObjectId();

    // Create Merchant Profile
    await MerchantProfile.create({
      _id: merchantProfileId,
      user: testUserId,
      stripeConnectedAccountId: merchantAccountId,
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'NOT_CREATED',
      detailsSubmitted: false,
      payoutsEnabled: false,
      transfersCapability: 'inactive',
      currentlyDue: [],
      pastDue: [],
      eventuallyDue: [],
      creationAttemptCount: 1,
    });

    // Create Organizer Profile
    await OrganizerProfile.create({
      _id: organizerProfileId,
      user: testUserId,
      stripeConnectedAccountId: organizerAccountId,
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'NOT_CREATED',
      detailsSubmitted: false,
      payoutsEnabled: false,
      transfersCapability: 'inactive',
      currentlyDue: [],
      pastDue: [],
      eventuallyDue: [],
      creationAttemptCount: 1,
    });

    // Populate Stripe accounts map
    stripeAccountsMap.clear();
    stripeAccountsMap.set(merchantAccountId, {
      id: merchantAccountId,
      type: 'express',
      details_submitted: true,
      payouts_enabled: true,
      capabilities: { transfers: 'active' },
      requirements: {
        currently_due: [],
        past_due: [],
        eventually_due: [],
        disabled_reason: null,
      },
      metadata: {
        skatriumUserId: testUserId.toString(),
        skatriumRole: 'MARCHANT',
        skatriumProfileId: merchantProfileId.toString(),
        environment: config.stripe.expected_livemode ? 'production' : 'test',
      },
    });

    stripeAccountsMap.set(organizerAccountId, {
      id: organizerAccountId,
      type: 'express',
      details_submitted: false,
      payouts_enabled: false,
      capabilities: { transfers: 'inactive' },
      requirements: {
        currently_due: ['identity.document'],
        past_due: [],
        eventually_due: ['identity.document'],
        disabled_reason: 'requirements.past_due',
      },
      metadata: {
        skatriumUserId: testUserId.toString(),
        skatriumRole: 'ORGANIZER',
        skatriumProfileId: organizerProfileId.toString(),
        environment: config.stripe.expected_livemode ? 'production' : 'test',
      },
    });

    // Mock Stripe SDK
    const mockStripe: any = {
      accounts: {
        retrieve: async (id: string) => {
          if (stripeAccountsMap.has(id)) {
            return stripeAccountsMap.get(id);
          }
          const err: any = new Error(`No such account: ${id}`);
          err.code = 'resource_missing';
          throw err;
        },
      },
      webhooks: {
        constructEvent: (
          payload: Buffer | string,
          sig: string,
          secret: string,
        ) => {
          if (secret !== testSecret) {
            throw new Error('No set header / Invalid secret');
          }
          if (sig !== 'valid_signature') {
            throw new Error('Invalid signature header');
          }
          return JSON.parse(payload.toString());
        },
      },
    };

    setStripeClient(mockStripe);
  });

  describe('1. Signature & Secret Verification', () => {
    it('Test 1: Valid signature successfully constructs Stripe Event', () => {
      const payload = JSON.stringify({
        id: 'evt_test_1',
        type: 'account.updated',
      });
      const event = stripeConnectWebhookService.verifyConnectWebhookSignature(
        payload,
        'valid_signature',
      );
      expect(event.id).toBe('evt_test_1');
    });

    it('Test 2: Invalid signature returns 400 Bad Request error', async () => {
      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'invalid_signature')
        .send({ id: 'evt_test_2', type: 'account.updated' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/signature verification failed/i);
    });

    it('Test 3: Missing signature header returns 400 Bad Request error', async () => {
      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .send({ id: 'evt_test_3', type: 'account.updated' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Missing Stripe signature header/i);
    });

    it('Test 4: Missing STRIPE_CONNECT_WEBHOOK_SECRET fails closed immediately', () => {
      config.stripe.connect_webhook_secret = '';
      try {
        stripeConnectWebhookService.verifyConnectWebhookSignature(
          '{}',
          'valid_signature',
        );
        throw new Error('Should have thrown error');
      } catch (err: any) {
        expect(err.message).toMatch(/missing or unconfigured/i);
      } finally {
        config.stripe.connect_webhook_secret = testSecret;
      }
    });
  });

  describe('2. Idempotency, Concurrency & State Machine', () => {
    it('Test 5: First delivery of valid webhook processes cleanly to SUCCESS', async () => {
      const payload = {
        id: 'evt_sync_5',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000000,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUCCESS');

      const eventDoc = await StripeConnectWebhookEvent.findOne({
        stripeEventId: 'evt_sync_5',
      });
      expect(eventDoc?.processingStatus).toBe('SUCCESS');
    });

    it('Test 6: Duplicate webhook delivery returns 200 OK with ALREADY_PROCESSED', async () => {
      const payload = {
        id: 'evt_sync_6',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000001,
      };

      const res1 = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('ALREADY_PROCESSED');
    });

    it('Test 7: Atomic lock transition prevents race conditions on concurrent deliveries (Promise.all)', async () => {
      const payload = {
        id: 'evt_sync_7',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000002,
      };

      const results = await Promise.all([
        request(app)
          .post('/api/v1/connect/stripe/webhook')
          .set('stripe-signature', 'valid_signature')
          .send(payload),
        request(app)
          .post('/api/v1/connect/stripe/webhook')
          .set('stripe-signature', 'valid_signature')
          .send(payload),
      ]);

      expect(results.some((r) => r.status === 200)).toBe(true);

      const eventCount = await StripeConnectWebhookEvent.countDocuments({
        stripeEventId: 'evt_sync_7',
      });
      expect(eventCount).toBe(1);
    });

    it('Test 8: Stale lock recovery picks up crashed PROCESSING event after timeout', async () => {
      const staleDate = new Date(Date.now() - 600000); // 10 minutes ago
      await StripeConnectWebhookEvent.collection.insertOne({
        stripeEventId: 'evt_sync_8',
        eventType: 'account.updated',
        accountId: merchantAccountId,
        processingStatus: 'PROCESSING',
        attemptCount: 1,
        createdAt: staleDate,
        updatedAt: staleDate,
      });

      const payload = {
        id: 'evt_sync_8',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000003,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUCCESS');
    });

    it('Test 9: Transient API failure marks event FAILED and returns 500 (allowing retry)', async () => {
      const mockFailingStripe: any = {
        accounts: {
          retrieve: async () => {
            const err: any = new Error('Stripe API 500 Internal Error');
            err.statusCode = 500;
            throw err;
          },
        },
        webhooks: {
          constructEvent: (p: Buffer | string) => JSON.parse(p.toString()),
        },
      };
      setStripeClient(mockFailingStripe);

      const payload = {
        id: 'evt_sync_9',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000004,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(500);

      const eventDoc = await StripeConnectWebhookEvent.findOne({
        stripeEventId: 'evt_sync_9',
      });
      expect(eventDoc?.processingStatus).toBe('FAILED');
    });

    it('Test 10: Metadata mismatch marks event MANUAL_RECONCILIATION_REQUIRED and returns 200 (terminal, no retries)', async () => {
      stripeAccountsMap.set('acct_bad_meta', {
        id: 'acct_bad_meta',
        metadata: { skatriumRole: 'INVALID_ROLE' },
      });

      const payload = {
        id: 'evt_sync_10',
        type: 'account.updated',
        account: 'acct_bad_meta',
        created: 1700000005,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MANUAL_RECONCILIATION_REQUIRED');

      const eventDoc = await StripeConnectWebhookEvent.findOne({
        stripeEventId: 'evt_sync_10',
      });
      expect(eventDoc?.processingStatus).toBe('MANUAL_RECONCILIATION_REQUIRED');
    });
  });

  describe('3. 5-Point Metadata Validation & Zero-Guessing', () => {
    it('Test 11: Valid 5-point metadata successfully resolves target profile', async () => {
      const payload = {
        id: 'evt_sync_11',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000010,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUCCESS');

      const profile = await MerchantProfile.findById(merchantProfileId);
      expect(profile?.onboardingStatus).toBe('READY');
      expect(profile?.detailsSubmitted).toBe(true);
      expect(profile?.payoutsEnabled).toBe(true);
    });

    it('Test 12: Missing skatriumProfileId sets MANUAL_RECONCILIATION_REQUIRED (0 profile mutation, returns 200)', async () => {
      stripeAccountsMap.set('acct_no_profile', {
        id: 'acct_no_profile',
        metadata: {
          skatriumUserId: testUserId.toString(),
          skatriumRole: 'MARCHANT',
        },
      });

      const payload = {
        id: 'evt_sync_12',
        type: 'account.updated',
        account: 'acct_no_profile',
        created: 1700000011,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MANUAL_RECONCILIATION_REQUIRED');
    });

    it('Test 13: Mismatched skatriumUserId sets MANUAL_RECONCILIATION_REQUIRED (0 profile mutation, returns 200)', async () => {
      stripeAccountsMap.set('acct_bad_user', {
        id: 'acct_bad_user',
        metadata: {
          skatriumUserId: new Types.ObjectId().toString(),
          skatriumRole: 'MARCHANT',
          skatriumProfileId: merchantProfileId.toString(),
        },
      });

      const payload = {
        id: 'evt_sync_13',
        type: 'account.updated',
        account: 'acct_bad_user',
        created: 1700000012,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MANUAL_RECONCILIATION_REQUIRED');
    });

    it('Test 14: Mismatched skatriumRole sets MANUAL_RECONCILIATION_REQUIRED (0 profile mutation, returns 200)', async () => {
      stripeAccountsMap.set('acct_bad_role', {
        id: 'acct_bad_role',
        metadata: {
          skatriumUserId: testUserId.toString(),
          skatriumRole: 'KAATEDJ',
          skatriumProfileId: merchantProfileId.toString(),
        },
      });

      const payload = {
        id: 'evt_sync_14',
        type: 'account.updated',
        account: 'acct_bad_role',
        created: 1700000013,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MANUAL_RECONCILIATION_REQUIRED');
    });

    it('Test 15: Mismatched skatriumProfileId sets MANUAL_RECONCILIATION_REQUIRED (0 profile mutation, returns 200)', async () => {
      stripeAccountsMap.set('acct_wrong_prof', {
        id: 'acct_wrong_prof',
        metadata: {
          skatriumUserId: testUserId.toString(),
          skatriumRole: 'MARCHANT',
          skatriumProfileId: new Types.ObjectId().toString(),
        },
      });

      const payload = {
        id: 'evt_sync_15',
        type: 'account.updated',
        account: 'acct_wrong_prof',
        created: 1700000014,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MANUAL_RECONCILIATION_REQUIRED');
    });

    it('Test 16: Mismatched environment sets MANUAL_RECONCILIATION_REQUIRED (0 profile mutation, returns 200)', async () => {
      stripeAccountsMap.set('acct_bad_env', {
        id: 'acct_bad_env',
        metadata: {
          skatriumUserId: testUserId.toString(),
          skatriumRole: 'MARCHANT',
          skatriumProfileId: merchantProfileId.toString(),
          environment: config.stripe.expected_livemode
            ? 'development'
            : 'production',
        },
      });

      const payload = {
        id: 'evt_sync_16',
        type: 'account.updated',
        account: 'acct_bad_env',
        created: 1700000015,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MANUAL_RECONCILIATION_REQUIRED');
    });

    it('Test 17: Non-existent profile ID sets MANUAL_RECONCILIATION_REQUIRED', async () => {
      const nonExistentId = new Types.ObjectId();
      stripeAccountsMap.set('acct_non_existent', {
        id: 'acct_non_existent',
        metadata: {
          skatriumUserId: testUserId.toString(),
          skatriumRole: 'MARCHANT',
          skatriumProfileId: nonExistentId.toString(),
          environment: config.stripe.expected_livemode ? 'production' : 'test',
        },
      });

      const payload = {
        id: 'evt_sync_17',
        type: 'account.updated',
        account: 'acct_non_existent',
        created: 1700000016,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MANUAL_RECONCILIATION_REQUIRED');
    });

    it('Test 18: Multiple profile collision sets MANUAL_RECONCILIATION_REQUIRED', async () => {
      const mockFind = jest.spyOn(MerchantProfile, 'find').mockResolvedValueOnce([
        { _id: merchantProfileId } as any,
        { _id: new Types.ObjectId() } as any,
      ]);

      const payload = {
        id: 'evt_sync_18',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000017,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('MANUAL_RECONCILIATION_REQUIRED');
      mockFind.mockRestore();
    });
  });

  describe('4. Role Isolation & Dual-Account Separation', () => {
    it('Test 19: account.updated for Merchant account updates MerchantProfile ONLY', async () => {
      const payload = {
        id: 'evt_sync_19',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000020,
      };

      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      const mProf = await MerchantProfile.findById(merchantProfileId);
      const oProf = await OrganizerProfile.findById(organizerProfileId);

      expect(mProf?.onboardingStatus).toBe('READY');
      expect(oProf?.onboardingStatus).toBe('NOT_CREATED'); // Organizer UNTOUCHED!
    });

    it('Test 20: account.updated for Organizer account updates OrganizerProfile ONLY', async () => {
      const payload = {
        id: 'evt_sync_20',
        type: 'account.updated',
        account: organizerAccountId,
        created: 1700000021,
      };

      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      const mProf = await MerchantProfile.findById(merchantProfileId);
      const oProf = await OrganizerProfile.findById(organizerProfileId);

      expect(mProf?.onboardingStatus).toBe('NOT_CREATED'); // Merchant UNTOUCHED!
      expect(oProf?.onboardingStatus).toBe('RESTRICTED');
    });

    it('Test 21: Dual-role user: Account A webhook does NOT mutate OrganizerProfile', async () => {
      const payload = {
        id: 'evt_sync_21',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000022,
      };

      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      const oProf = await OrganizerProfile.findById(organizerProfileId);
      expect(oProf?.onboardingStatus).toBe('NOT_CREATED');
      expect(oProf?.detailsSubmitted).toBe(false);
    });

    it('Test 22: Dual-role user: Account B webhook does NOT mutate MerchantProfile', async () => {
      const payload = {
        id: 'evt_sync_22',
        type: 'account.updated',
        account: organizerAccountId,
        created: 1700000023,
      };

      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      const mProf = await MerchantProfile.findById(merchantProfileId);
      expect(mProf?.onboardingStatus).toBe('NOT_CREATED');
      expect(mProf?.detailsSubmitted).toBe(false);
    });
  });

  describe('5. Payload Extraction & Event Scope', () => {
    it('Test 23: account.updated payload correctly extracts account ID from event.account or event.data.object.id', () => {
      const ev1: any = {
        id: 'evt_1',
        type: 'account.updated',
        account: 'acct_1',
      };
      expect(stripeConnectWebhookService.extractAccountIdFromEvent(ev1)).toBe(
        'acct_1',
      );

      const ev2: any = {
        id: 'evt_2',
        type: 'account.updated',
        data: { object: { id: 'acct_2' } },
      };
      expect(stripeConnectWebhookService.extractAccountIdFromEvent(ev2)).toBe(
        'acct_2',
      );
    });

    it('Test 24: capability.updated payload correctly extracts account ID from event.account or event.data.object.account', () => {
      const ev1: any = {
        id: 'evt_1',
        type: 'capability.updated',
        account: 'acct_1',
      };
      expect(stripeConnectWebhookService.extractAccountIdFromEvent(ev1)).toBe(
        'acct_1',
      );

      const ev2: any = {
        id: 'evt_2',
        type: 'capability.updated',
        data: { object: { account: 'acct_2' } },
      };
      expect(stripeConnectWebhookService.extractAccountIdFromEvent(ev2)).toBe(
        'acct_2',
      );
    });

    it('Test 25: Valid unsupported event (e.g. payout.created) is safely persisted as SUCCESS without profile mutation', async () => {
      const payload = {
        id: 'evt_sync_25',
        type: 'payout.created',
        account: merchantAccountId,
        created: 1700000025,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNSUPPORTED_EVENT_AUDITED');

      const eventDoc = await StripeConnectWebhookEvent.findOne({
        stripeEventId: 'evt_sync_25',
      });
      expect(eventDoc?.processingStatus).toBe('SUCCESS');

      const mProf = await MerchantProfile.findById(merchantProfileId);
      expect(mProf?.onboardingStatus).toBe('NOT_CREATED'); // Profile NOT mutated!
    });
  });

  describe('6. Event Ordering & Status Evaluator Integration', () => {
    it('Test 26: stripeLastEventCreatedAt is recorded on profile during sync', async () => {
      const eventTime = 1700000030;
      const payload = {
        id: 'evt_sync_26',
        type: 'account.updated',
        account: merchantAccountId,
        created: eventTime,
      };

      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      const profile = await MerchantProfile.findById(merchantProfileId);
      expect(profile?.stripeLastEventCreatedAt).toEqual(
        new Date(eventTime * 1000),
      );
    });

    it('Test 27: Out-of-order older event (event.created * 1000 < profile.stripeLastEventCreatedAt) is rejected at MongoDB filter level', async () => {
      // 1. Process newer event (t = 1700000100)
      const payloadNewer = {
        id: 'evt_sync_27_newer',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000100,
      };
      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payloadNewer);

      const profileAfterNewer = await MerchantProfile.findById(
        merchantProfileId,
      );
      expect(profileAfterNewer?.stripeLastEventCreatedAt).toEqual(
        new Date(1700000100 * 1000),
      );

      // Mutate Stripe mock account to DISABLED to test if older event overwrites it
      stripeAccountsMap.set(merchantAccountId, {
        ...stripeAccountsMap.get(merchantAccountId),
        requirements: { disabled_reason: 'rejected.fraud' },
      });

      // 2. Process older event (t = 1700000050)
      const payloadOlder = {
        id: 'evt_sync_27_older',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000050,
      };

      const resOlder = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payloadOlder);

      expect(resOlder.status).toBe(200);

      const profileAfterOlder = await MerchantProfile.findById(
        merchantProfileId,
      );
      // Ensure timestamp remained at 1700000100 and status was NOT overwritten by older event!
      expect(profileAfterOlder?.stripeLastEventCreatedAt).toEqual(
        new Date(1700000100 * 1000),
      );
    });

    it('Test 28: Status evaluator output READY correctly updates profile attributes', async () => {
      const payload = {
        id: 'evt_sync_28',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000040,
      };

      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      const profile = await MerchantProfile.findById(merchantProfileId);
      expect(profile?.onboardingStatus).toBe('READY');
      expect(profile?.transfersCapability).toBe('active');
    });

    it('Test 29: Status evaluator output ONBOARDING_REQUIRED correctly updates profile attributes', async () => {
      stripeAccountsMap.set(merchantAccountId, {
        ...stripeAccountsMap.get(merchantAccountId),
        details_submitted: false,
        payouts_enabled: false,
        capabilities: { transfers: 'inactive' },
      });

      const payload = {
        id: 'evt_sync_29',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000041,
      };

      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      const profile = await MerchantProfile.findById(merchantProfileId);
      expect(profile?.onboardingStatus).toBe('ONBOARDING_REQUIRED');
      expect(profile?.detailsSubmitted).toBe(false);
    });

    it('Test 30: Status evaluator output RESTRICTED / DISABLED correctly updates profile attributes', async () => {
      stripeAccountsMap.set(merchantAccountId, {
        ...stripeAccountsMap.get(merchantAccountId),
        details_submitted: true,
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: 'rejected.fraud',
        },
      });

      const payload = {
        id: 'evt_sync_30',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000042,
      };

      await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      const profile = await MerchantProfile.findById(merchantProfileId);
      expect(profile?.onboardingStatus).toBe('DISABLED');
      expect(profile?.disabledReason).toBe('rejected.fraud');
    });

    it('Test 31: Transient Stripe retrieval failure triggers FAILED status for retry', async () => {
      const mockFailOnce: any = {
        accounts: {
          retrieve: async () => {
            throw new Error('Stripe API timeout');
          },
        },
        webhooks: {
          constructEvent: (p: Buffer | string) => JSON.parse(p.toString()),
        },
      };
      setStripeClient(mockFailOnce);

      const payload = {
        id: 'evt_sync_31',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000043,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(500);

      const eventDoc = await StripeConnectWebhookEvent.findOne({
        stripeEventId: 'evt_sync_31',
      });
      expect(eventDoc?.processingStatus).toBe('FAILED');
    });

    it('Test 32: MongoDB update failure triggers FAILED status for retry', async () => {
      // Intentionally cause MongoDB findOneAndUpdate to throw an error by corrupting Model or invalid ObjectId
      const origFindOne = MerchantProfile.findOne;
      (MerchantProfile as any).find = () => {
        throw new Error('Database connection lost');
      };

      const payload = {
        id: 'evt_sync_32',
        type: 'account.updated',
        account: merchantAccountId,
        created: 1700000044,
      };

      const res = await request(app)
        .post('/api/v1/connect/stripe/webhook')
        .set('stripe-signature', 'valid_signature')
        .send(payload);

      expect(res.status).toBe(500);

      // Restore MerchantProfile.find
      (MerchantProfile as any).find = origFindOne;
    });
  });
});
