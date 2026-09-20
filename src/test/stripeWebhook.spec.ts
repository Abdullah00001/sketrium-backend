import request from 'supertest';
import Stripe from 'stripe';
import app from '../app';
import { stripeWebhookRepository } from '../app/modules/payment/stripeWebhook.repository';
import { stripeEventDispatcher } from '../app/modules/payment/stripeWebhook.dispatcher';

const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => {
    return {
      webhooks: {
        constructEvent: (...args: any[]) => mockConstructEvent(...args),
        generateTestHeaderString: jest.fn().mockReturnValue('t=123,v1=mock_sig'),
      },
    };
  });
});

// Mock config for tests
jest.mock('../app/config', () => {
  const actualConfig = jest.requireActual('../app/config').default;
  return {
    __esModule: true,
    default: {
      ...actualConfig,
      aws: actualConfig.aws || { region: 'us-east-1', access_key: 'test', secret_key: 'test', bucket: 'test' },
      stripe: {
        stripe_secret_key: 'sk_test_mock_key',
        stripe_webhook_secret: 'whsec_mock_secret',
        expected_livemode: false,
        processing_timeout_ms: 300000,
      },
      node_env: 'test',
    },
  };
});

describe('Stripe Webhook Foundation (Phase 1)', () => {
  const secret = 'whsec_mock_secret';
  const stripe = new Stripe('sk_test_mock_key');

  const createSignedBuffer = (payload: object, eventSecret: string = secret) => {
    const payloadString = JSON.stringify(payload);
    const signature = 't=12345,v1=valid_mock_signature';
    return { payloadBuffer: Buffer.from(payloadString), signature };
  };

  const sampleEventData = {
    id: 'evt_test_12345',
    object: 'event',
    api_version: '2026-08-26.dahlia',
    created: 1726000000,
    type: 'payment_intent.succeeded',
    livemode: false,
    data: {
      object: {
        id: 'pi_test_99999',
        object: 'payment_intent',
        amount: 10000,
        currency: 'usd',
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupConstructEventMock = (eventData: any, shouldFailSignature: boolean = false) => {
    mockConstructEvent.mockImplementation((rawBody: any, sig: string, sec: string) => {
      if (shouldFailSignature || sig.includes('invalid')) {
        throw new Error('Webhook Signature Verification Failed: Invalid Signature');
      }
      return eventData;
    });
  };

  describe('Webhook Endpoint Integrity & Security', () => {
    it('1. Valid Signature: Accepts request and processes successfully', async () => {
      const { payloadBuffer, signature } = createSignedBuffer(sampleEventData);
      setupConstructEventMock(sampleEventData);

      jest.spyOn(stripeWebhookRepository, 'findByEventId').mockResolvedValue(null);
      jest.spyOn(stripeWebhookRepository, 'createPendingEvent').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        eventType: sampleEventData.type,
        livemode: false,
        stripeCreatedAt: new Date(),
        payload: {
          id: sampleEventData.id,
          type: sampleEventData.type,
          created: sampleEventData.created,
          livemode: false,
        },
        processingStatus: 'PENDING',
        receivedAt: new Date(),
        attemptCount: 0,
      } as any);

      jest.spyOn(stripeWebhookRepository, 'claimProcessing').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        eventType: sampleEventData.type,
        livemode: false,
        stripeCreatedAt: new Date(),
        payload: {
          id: sampleEventData.id,
          type: sampleEventData.type,
          created: sampleEventData.created,
          livemode: false,
        },
        processingStatus: 'PROCESSING',
        receivedAt: new Date(),
        attemptCount: 1,
      } as any);

      jest.spyOn(stripeWebhookRepository, 'markSuccess').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('processed');
    });

    it('2. Invalid Signature: Rejects request with 400 Bad Request', async () => {
      const { payloadBuffer } = createSignedBuffer(sampleEventData);
      const invalidSignature = 't=12345,v1=invalid_signature_hash';
      setupConstructEventMock(sampleEventData, true);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', invalidSignature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Webhook Signature Verification Failed/i);
    });

    it('3. Missing Signature Header: Rejects request with 400 Bad Request', async () => {
      const payloadBuffer = Buffer.from(JSON.stringify(sampleEventData));

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Missing stripe-signature header/i);
    });

    it('4. Malformed Payload: Rejects invalid JSON payload with 400', async () => {
      const malformedBody = Buffer.from('{"id": "evt_test", "type": ');
      const signature = 't=12345,v1=valid_mock_signature';

      setupConstructEventMock(sampleEventData, true);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(malformedBody);

      expect(res.status).toBe(400);
    });

    it('5. Livemode Mismatch: Rejects livemode=true when config expected_livemode is false', async () => {
      const liveEventData = { ...sampleEventData, livemode: true };
      const { payloadBuffer, signature } = createSignedBuffer(liveEventData);
      setupConstructEventMock(liveEventData);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Livemode mismatch/i);
    });
  });

  describe('Idempotency & State Machine Transitions', () => {
    it('6 & 7. Duplicate SUCCESS Delivery: Returns 200 without executing handler again', async () => {
      const { payloadBuffer, signature } = createSignedBuffer(sampleEventData);
      setupConstructEventMock(sampleEventData);

      jest.spyOn(stripeWebhookRepository, 'findByEventId').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        processingStatus: 'SUCCESS',
      } as any);

      jest.spyOn(stripeWebhookRepository, 'claimProcessing').mockResolvedValue(null);

      const dispatcherSpy = jest.spyOn(stripeEventDispatcher, 'dispatch');

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('already_processed');
      expect(dispatcherSpy).not.toHaveBeenCalled();
    });

    it('8 & 11. Concurrent Delivery Protection: Secondary request receives processing status acknowledgment', async () => {
      const { payloadBuffer, signature } = createSignedBuffer(sampleEventData);
      setupConstructEventMock(sampleEventData);

      jest.spyOn(stripeWebhookRepository, 'findByEventId').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        processingStatus: 'PROCESSING',
      } as any);

      jest.spyOn(stripeWebhookRepository, 'claimProcessing').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('processing');
    });

    it('9. FAILED Event Retry: Successfully re-claims FAILED event and executes handler', async () => {
      const { payloadBuffer, signature } = createSignedBuffer(sampleEventData);
      setupConstructEventMock(sampleEventData);

      jest.spyOn(stripeWebhookRepository, 'findByEventId').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        processingStatus: 'FAILED',
      } as any);

      jest.spyOn(stripeWebhookRepository, 'claimProcessing').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        eventType: sampleEventData.type,
        processingStatus: 'PROCESSING',
        attemptCount: 2,
      } as any);

      jest.spyOn(stripeWebhookRepository, 'markSuccess').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('processed');
    });

    it('12. Stale Lock Recovery: Reclaims PROCESSING lock if lastAttemptAt > 5 mins', async () => {
      const { payloadBuffer, signature } = createSignedBuffer(sampleEventData);
      const sixMinutesAgo = new Date(Date.now() - 360000);
      setupConstructEventMock(sampleEventData);

      jest.spyOn(stripeWebhookRepository, 'findByEventId').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        processingStatus: 'PROCESSING',
        lastAttemptAt: sixMinutesAgo,
      } as any);

      jest.spyOn(stripeWebhookRepository, 'claimProcessing').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        eventType: sampleEventData.type,
        processingStatus: 'PROCESSING',
        lastAttemptAt: new Date(),
        attemptCount: 2,
      } as any);

      jest.spyOn(stripeWebhookRepository, 'markSuccess').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('processed');
    });
  });

  describe('Dispatcher & Unsupported Events', () => {
    it('15. Unsupported Event: Valid signature for unsupported event type is persisted & acknowledged with 200', async () => {
      const unsupportedEvent = {
        ...sampleEventData,
        id: 'evt_unsupported_111',
        type: 'customer.created',
      };
      const { payloadBuffer, signature } = createSignedBuffer(unsupportedEvent);
      setupConstructEventMock(unsupportedEvent);

      jest.spyOn(stripeWebhookRepository, 'findByEventId').mockResolvedValue(null);
      jest.spyOn(stripeWebhookRepository, 'createPendingEvent').mockResolvedValue({
        stripeEventId: unsupportedEvent.id,
        eventType: unsupportedEvent.type,
      } as any);

      jest.spyOn(stripeWebhookRepository, 'claimProcessing').mockResolvedValue({
        stripeEventId: unsupportedEvent.id,
        eventType: unsupportedEvent.type,
      } as any);

      jest.spyOn(stripeWebhookRepository, 'markSuccess').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('unsupported_acknowledged');
    });

    it('13 & 14. Handler / Database Failure: Records FAILED state and returns 500 for Stripe retry', async () => {
      const { payloadBuffer, signature } = createSignedBuffer(sampleEventData);
      setupConstructEventMock(sampleEventData);

      jest.spyOn(stripeWebhookRepository, 'findByEventId').mockResolvedValue(null);
      jest.spyOn(stripeWebhookRepository, 'createPendingEvent').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        eventType: sampleEventData.type,
      } as any);

      jest.spyOn(stripeWebhookRepository, 'claimProcessing').mockResolvedValue({
        stripeEventId: sampleEventData.id,
        eventType: sampleEventData.type,
      } as any);

      jest.spyOn(stripeEventDispatcher, 'dispatch').mockRejectedValue(new Error('Simulated Handler Crash'));
      const markFailedSpy = jest.spyOn(stripeWebhookRepository, 'markFailed').mockResolvedValue({} as any);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadBuffer);

      expect(res.status).toBe(500);
      expect(markFailedSpy).toHaveBeenCalledWith(
        sampleEventData.id,
        expect.objectContaining({
          code: 'PROCESSING_ERROR',
          message: 'Simulated Handler Crash',
          category: 'EVENT_HANDLER_FAILURE',
        })
      );
    });
  });
});
