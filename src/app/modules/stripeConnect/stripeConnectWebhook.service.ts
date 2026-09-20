import Stripe from 'stripe';
import httpStatus from 'http-status';
import { Model, Types } from 'mongoose';
import AppError from '../../error/AppError';
import config from '../../config';
import { getStripeClient } from '../../utils/stripeClient';
import { MerchantProfile } from '../merchantProfile/merchantProfile.model';
import { OrganizerProfile } from '../organizerProfile/organizerProfile.model';
import { StripeConnectWebhookEvent } from './stripeConnectWebhookEvent.model';
import { evaluateStripeAccountStatus } from './stripeConnect.statusEvaluator';
import { StripeSellerRole } from './stripeConnect.interface';

export interface IConnectWebhookProcessResult {
  status:
    | 'SUCCESS'
    | 'ALREADY_PROCESSED'
    | 'UNSUPPORTED_EVENT_AUDITED'
    | 'MANUAL_RECONCILIATION_REQUIRED'
    | 'FAILED';
  httpStatus: number;
  message?: string;
}

export class StripeConnectWebhookService {
  /**
   * Verifies Connect Webhook Signature. Fails closed if secret is unconfigured/empty.
   */
  public verifyConnectWebhookSignature(
    payload: Buffer | string,
    signature: string,
  ): any {
    const secret = config.stripe.connect_webhook_secret;
    if (!secret || secret.trim() === '') {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Stripe Connect webhook secret is missing or unconfigured. Request rejected fail-closed.',
      );
    }

    if (!signature) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Missing Stripe signature header.',
      );
    }

    const stripe = getStripeClient();
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (err: any) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Stripe Connect Webhook signature verification failed: ${err.message}`,
      );
    }
  }

  /**
   * Explicitly extracts account ID for both account.updated and capability.updated events.
   */
  public extractAccountIdFromEvent(event: any): string | null {
    if (event.account) return event.account;

    const dataObj = event.data?.object as any;
    if (!dataObj) return null;

    if (event.type === 'account.updated') {
      return dataObj.id || null;
    }

    if (event.type === 'capability.updated') {
      return dataObj.account || dataObj.id || null;
    }

    return dataObj.account || dataObj.id || null;
  }

  /**
   * Validates metadata environment against configured livemode expectation.
   */
  public isEnvironmentValid(envMetadata?: string | null): boolean {
    if (!envMetadata) return true;
    const expectedLive = config.stripe.expected_livemode;
    const norm = envMetadata.toLowerCase();
    if (expectedLive) {
      return norm === 'production' || norm === 'live';
    } else {
      return norm === 'development' || norm === 'test' || norm === 'sandbox';
    }
  }

  /**
   * Core Process Handler for Connect Webhooks.
   */
  public async handleConnectWebhookEvent(
    event: any,
  ): Promise<IConnectWebhookProcessResult> {
    const accountId = this.extractAccountIdFromEvent(event);
    const supportedEvents = ['account.updated', 'capability.updated'];

    // Audit valid unsupported events without mutating profiles
    if (!supportedEvents.includes(event.type)) {
      await StripeConnectWebhookEvent.findOneAndUpdate(
        { stripeEventId: event.id },
        {
          $set: {
            eventType: event.type,
            accountId: accountId,
            livemode: event.livemode || false,
            processingStatus: 'SUCCESS',
            processedAt: new Date(),
            payload: {
              id: event.id,
              type: event.type,
              created: event.created,
              account: event.account,
            },
          },
        },
        { upsert: true },
      );
      return { status: 'UNSUPPORTED_EVENT_AUDITED', httpStatus: 200 };
    }

    // Atomic Ownership Reservation Lock
    const staleTimeoutMs =
      config.stripe.connect_stale_lock_timeout_ms || 300000;
    const cutoffDate = new Date(Date.now() - staleTimeoutMs);

    let eventDoc = await StripeConnectWebhookEvent.findOne({
      stripeEventId: event.id,
    });

    if (eventDoc) {
      if (eventDoc.processingStatus === 'SUCCESS') {
        return { status: 'ALREADY_PROCESSED', httpStatus: 200 };
      }
      if (eventDoc.processingStatus === 'MANUAL_RECONCILIATION_REQUIRED') {
        return { status: 'MANUAL_RECONCILIATION_REQUIRED', httpStatus: 200 };
      }

      const isStale =
        eventDoc.processingStatus === 'PROCESSING' &&
        Boolean(eventDoc.updatedAt && eventDoc.updatedAt < cutoffDate);

      if (eventDoc.processingStatus === 'PROCESSING' && !isStale) {
        // Already processing in another concurrent call
        return { status: 'ALREADY_PROCESSED', httpStatus: 200 };
      } else {
        const updatedClaim = await StripeConnectWebhookEvent.findOneAndUpdate(
          {
            _id: eventDoc._id,
            $or: [
              { processingStatus: { $in: ['PENDING', 'FAILED'] } },
              {
                processingStatus: 'PROCESSING',
                updatedAt: { $lt: cutoffDate },
              },
            ],
          },
          {
            $set: {
              processingStatus: 'PROCESSING',
              eventType: event.type,
              accountId: accountId,
              livemode: event.livemode || false,
            },
            $inc: { attemptCount: 1 },
          },
          { new: true },
        );
        if (updatedClaim) {
          eventDoc = updatedClaim;
        }
      }
    } else {
      try {
        eventDoc = await StripeConnectWebhookEvent.create({
          stripeEventId: event.id,
          eventType: event.type,
          accountId: accountId,
          livemode: event.livemode || false,
          processingStatus: 'PROCESSING',
          attemptCount: 1,
          payload: {
            id: event.id,
            type: event.type,
            created: event.created,
            account: event.account,
          },
        });
      } catch (err: any) {
        if (err.code === 11000) {
          eventDoc = await StripeConnectWebhookEvent.findOne({
            stripeEventId: event.id,
          });
          if (eventDoc?.processingStatus === 'SUCCESS') {
            return { status: 'ALREADY_PROCESSED', httpStatus: 200 };
          }
          if (eventDoc?.processingStatus === 'MANUAL_RECONCILIATION_REQUIRED') {
            return { status: 'MANUAL_RECONCILIATION_REQUIRED', httpStatus: 200 };
          }
          if (eventDoc?.processingStatus === 'PROCESSING') {
            return { status: 'ALREADY_PROCESSED', httpStatus: 200 };
          }
        } else {
          throw err;
        }
      }
    }

    // Process event logic
    try {
      if (!accountId) {
        await StripeConnectWebhookEvent.findByIdAndUpdate(eventDoc!._id, {
          $set: {
            processingStatus: 'MANUAL_RECONCILIATION_REQUIRED',
            lastError: {
              code: 'MISSING_ACCOUNT_ID',
              message: 'Could not extract connected account ID from event.',
            },
          },
        });
        return { status: 'MANUAL_RECONCILIATION_REQUIRED', httpStatus: 200 };
      }

      // Retrieve live Stripe Account state
      const stripe = getStripeClient();
      let stripeAccount: any;
      try {
        stripeAccount = await stripe.accounts.retrieve(accountId);
      } catch (err: any) {
        await StripeConnectWebhookEvent.findByIdAndUpdate(eventDoc!._id, {
          $set: {
            processingStatus: 'FAILED',
            lastError: {
              code: err.code || err.type || 'STRIPE_RETRIEVAL_ERROR',
              message: err.message || 'Failed to retrieve live Stripe account',
            },
          },
        });
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          `Failed to retrieve live Stripe account: ${err.message}`,
        );
      }

      // 5-Point Metadata Verification
      const metadata = stripeAccount.metadata || {};
      const skatriumProfileId = metadata.skatriumProfileId;
      const skatriumUserId = metadata.skatriumUserId;
      const skatriumRole = metadata.skatriumRole as StripeSellerRole;
      const environmentMeta = metadata.environment;

      const p1_accountMatch = accountId === stripeAccount.id;
      const p2_profileIdPresent = Boolean(
        skatriumProfileId && Types.ObjectId.isValid(skatriumProfileId),
      );
      const p3_userIdPresent = Boolean(
        skatriumUserId && Types.ObjectId.isValid(skatriumUserId),
      );
      const p4_roleValid = ['MARCHANT', 'ORGANIZER'].includes(skatriumRole);
      const p5_envValid = this.isEnvironmentValid(environmentMeta);

      if (
        !p1_accountMatch ||
        !p2_profileIdPresent ||
        !p3_userIdPresent ||
        !p4_roleValid ||
        !p5_envValid
      ) {
        await StripeConnectWebhookEvent.findByIdAndUpdate(eventDoc!._id, {
          $set: {
            processingStatus: 'MANUAL_RECONCILIATION_REQUIRED',
            lastError: {
              code: 'METADATA_VERIFICATION_FAILED',
              message:
                'Stripe metadata failed 5-point ownership verification algorithm.',
            },
          },
        });
        return { status: 'MANUAL_RECONCILIATION_REQUIRED', httpStatus: 200 };
      }

      // Profile Lookup & Strict Role Isolation
      const TargetModel: Model<any> =
        skatriumRole === 'MARCHANT' ? MerchantProfile : OrganizerProfile;
      const profiles = await TargetModel.find({
        _id: new Types.ObjectId(skatriumProfileId),
        user: new Types.ObjectId(skatriumUserId),
        stripeConnectedAccountId: accountId,
      });

      if (profiles.length !== 1) {
        await StripeConnectWebhookEvent.findByIdAndUpdate(eventDoc!._id, {
          $set: {
            processingStatus: 'MANUAL_RECONCILIATION_REQUIRED',
            lastError: {
              code:
                profiles.length === 0
                  ? 'PROFILE_NOT_FOUND'
                  : 'MULTIPLE_PROFILES_FOUND',
              message: `Expected 1 matching profile, found ${profiles.length}.`,
            },
          },
        });
        return { status: 'MANUAL_RECONCILIATION_REQUIRED', httpStatus: 200 };
      }

      const targetProfile = profiles[0];

      // Evaluate telemetry via Phase 2 Evaluator
      const telemetry = evaluateStripeAccountStatus(stripeAccount);
      const eventDate = new Date(event.created * 1000);

      // Atomic Event Ordering Filter
      const filter = {
        _id: targetProfile._id,
        $or: [
          { stripeLastEventCreatedAt: { $exists: false } },
          { stripeLastEventCreatedAt: null },
          { stripeLastEventCreatedAt: { $lte: eventDate } },
        ],
      };

      const updateResult = await TargetModel.findOneAndUpdate(
        filter,
        {
          $set: {
            ...telemetry,
            stripeLastEventCreatedAt: eventDate,
            stripeLastSyncedAt: new Date(),
          },
        },
        { new: true },
      );

      if (!updateResult) {
        console.warn(
          `[StripeConnectWebhookService] Event ${event.id} timestamp ${eventDate.toISOString()} is older than target profile stripeLastEventCreatedAt. Profile update skipped for ordering safety.`,
        );
      }

      // Mark Event SUCCESS
      await StripeConnectWebhookEvent.findByIdAndUpdate(eventDoc!._id, {
        $set: {
          processingStatus: 'SUCCESS',
          processedAt: new Date(),
          lastError: null,
        },
      });

      return { status: 'SUCCESS', httpStatus: 200 };
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode < 500) {
        throw err;
      }
      await StripeConnectWebhookEvent.findByIdAndUpdate(eventDoc!._id, {
        $set: {
          processingStatus: 'FAILED',
          lastError: {
            code: err.code || err.name || 'PROCESSING_ERROR',
            message: err.message || 'Webhook processing failed',
          },
        },
      });
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `Connect Webhook processing error: ${err.message}`,
      );
    }
  }
}

export const stripeConnectWebhookService = new StripeConnectWebhookService();
