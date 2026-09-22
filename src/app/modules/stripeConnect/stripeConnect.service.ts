import crypto from 'crypto';
import { Model } from 'mongoose';
import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import config from '../../config';
import User from '../user/user.model';
import { TUser } from '../user/user.interface';
import { MerchantProfile } from '../merchantProfile/merchantProfile.model';
import { OrganizerProfile } from '../organizerProfile/organizerProfile.model';
import { IMerchantProfile } from '../merchantProfile/merchantProfile.interface';
import { IOrganizerProfile } from '../organizerProfile/organizerProfile.interface';
import { getStripeClient } from '../../utils/stripeClient';
import { onboardingTokenStore } from './stripeConnect.tokenStore';
import { evaluateStripeAccountStatus } from './stripeConnect.statusEvaluator';
import {
  assertMerchantRoleAccess,
  assertOrganizerRoleAccess,
} from './stripeConnect.authorization';
import {
  IOnboardResponse,
  IStripeStatusResponse,
  StripeSellerRole,
} from './stripeConnect.interface';

export class StripeConnectService {
  private getModel(role: StripeSellerRole): Model<any> {
    return role === 'MARCHANT' ? MerchantProfile : OrganizerProfile;
  }

  /**
   * Retrieves or creates the initial profile for a given user and role.
   */
  public async getOrCreateProfile(
    userId: string,
    role: StripeSellerRole,
  ): Promise<IMerchantProfile | IOrganizerProfile> {
    const Model = this.getModel(role);
    let profile = await Model.findOne({ user: userId });
    if (!profile) {
      profile = await Model.create({
        user: userId,
        accountCreationStatus: 'NOT_STARTED',
        onboardingStatus: 'NOT_CREATED',
        creationAttemptCount: 0,
        detailsSubmitted: false,
        payoutsEnabled: false,
        transfersCapability: 'inactive',
        currentlyDue: [],
        pastDue: [],
        eventuallyDue: [],
      });
    }
    return profile;
  }

  /**
   * Atomically initializes an account creation operation and reserves ownership.
   *
   * State Rules:
   * - NOT_STARTED / FAILED: generates a new accountCreationOperationId and stripeIdempotencyKey.
   * - RECOVERY_REQUIRED / stale CREATING: retains existing accountCreationOperationId and stripeIdempotencyKey.
   * - Concurrent request (non-stale CREATING): receives isOwner = false and reuses the existing operation.
   */
  public async acquireCreationOperation(
    profileId: string,
    role: StripeSellerRole,
  ): Promise<{
    profile: IMerchantProfile | IOrganizerProfile;
    isOwner: boolean;
  }> {
    const Model = this.getModel(role);
    const currentProfile = await Model.findById(profileId);
    if (!currentProfile) {
      throw new AppError(httpStatus.NOT_FOUND, 'Profile not found');
    }

    const staleTimeoutMs =
      config.stripe.connect_stale_lock_timeout_ms || 300000;
    const cutoffDate = new Date(Date.now() - staleTimeoutMs);

    const isStale =
      currentProfile.accountCreationStatus === 'CREATING' &&
      currentProfile.accountCreationStartedAt &&
      new Date(currentProfile.accountCreationStartedAt) < cutoffDate;

    if (currentProfile.accountCreationStatus === 'CREATING' && !isStale) {
      return { profile: currentProfile, isOwner: false };
    }

    // Determine operationId and idempotencyKey:
    // Only NOT_STARTED, FAILED, or missing operationId gets a new key pair.
    // RECOVERY_REQUIRED or stale CREATING reuses existing operation keys.
    const needsNewKeys =
      currentProfile.accountCreationStatus === 'NOT_STARTED' ||
      currentProfile.accountCreationStatus === 'FAILED' ||
      !currentProfile.accountCreationOperationId;

    let operationId = currentProfile.accountCreationOperationId;
    let idempotencyKey = currentProfile.stripeIdempotencyKey;

    if (needsNewKeys) {
      operationId = crypto.randomUUID();
      idempotencyKey = `skatrium_connect_op_${operationId}`;
    }

    const filter = {
      _id: profileId,
      $or: [
        {
          accountCreationStatus: {
            $in: ['NOT_STARTED', 'FAILED', 'RECOVERY_REQUIRED'],
          },
        },
        {
          accountCreationStatus: 'CREATING',
          accountCreationStartedAt: { $lt: cutoffDate },
        },
      ],
    };

    const updatedProfile = await Model.findOneAndUpdate(
      filter,
      {
        $set: {
          accountCreationOperationId: operationId,
          stripeIdempotencyKey: idempotencyKey,
          accountCreationStatus: 'CREATING',
          accountCreationStartedAt: new Date(),
          accountCreationLastAttemptAt: new Date(),
          accountCreationLastError: null,
        },
        $inc: { creationAttemptCount: 1 },
      },
      { new: true },
    );

    if (updatedProfile) {
      return { profile: updatedProfile, isOwner: true };
    }

    const reloaded = await Model.findById(profileId);
    return { profile: reloaded!, isOwner: false };
  }

  /**
   * Safe secondary metadata reconciliation & timeout recovery.
   * Searches Stripe by skatriumProfileId metadata.
   * Returns matching account or null.
   */
  public async reconcileOrRecoverAccount(
    profile: IMerchantProfile | IOrganizerProfile,
    role: StripeSellerRole,
  ): Promise<any | null> {
    const stripe = getStripeClient();
    const Model = this.getModel(role);

    try {
      const searchResult = await stripe.accounts.search({
        query: `metadata['skatriumProfileId']:'${profile._id!.toString()}'`,
      });

      if (searchResult.data.length > 1) {
        // Multiple account collision detected -> set MANUAL_RECONCILIATION_REQUIRED
        await Model.findByIdAndUpdate(profile._id, {
          $set: {
            accountCreationStatus: 'MANUAL_RECONCILIATION_REQUIRED',
            accountCreationLastError: {
              code: 'MULTIPLE_ACCOUNTS_FOUND',
              message:
                'Multiple Stripe accounts match the same profile metadata. Manual reconciliation required.',
            },
          },
        });
        throw new AppError(
          httpStatus.CONFLICT,
          'Multiple Stripe accounts match this profile. Manual reconciliation required.',
        );
      }

      if (searchResult.data.length === 1) {
        const foundAccount = searchResult.data[0];
        const telemetry = evaluateStripeAccountStatus(foundAccount);

        await Model.findByIdAndUpdate(profile._id, {
          $set: {
            stripeConnectedAccountId: foundAccount.id,
            accountCreationStatus: 'CREATED',
            accountCreationLastError: null,
            ...telemetry,
            stripeLastSyncedAt: new Date(),
          },
        });

        return foundAccount;
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      console.warn(
        `[StripeConnectService] Metadata search error during recovery: ${err.message}`,
      );
    }

    // Fallback: check if stripeConnectedAccountId is already saved on profile
    if (profile.stripeConnectedAccountId) {
      try {
        const retrievedAccount = await stripe.accounts.retrieve(
          profile.stripeConnectedAccountId,
        );
        const telemetry = evaluateStripeAccountStatus(retrievedAccount);
        await Model.findByIdAndUpdate(profile._id, {
          $set: {
            accountCreationStatus: 'CREATED',
            accountCreationLastError: null,
            ...telemetry,
            stripeLastSyncedAt: new Date(),
          },
        });
        return retrievedAccount;
      } catch (err: any) {
        console.warn(
          `[StripeConnectService] Account retrieve error for ${profile.stripeConnectedAccountId}: ${err.message}`,
        );
      }
    }

    return null;
  }

  /**
   * Executes Stripe Connected Account creation with fixed operation Idempotency-Key.
   */
  public async createStripeAccount(
    user: TUser,
    profile: IMerchantProfile | IOrganizerProfile,
    role: StripeSellerRole,
  ): Promise<any> {
    const stripe = getStripeClient();
    const Model = this.getModel(role);

    if (!profile.stripeIdempotencyKey) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Missing operation idempotency key',
      );
    }

    try {
      const newAccount = await stripe.accounts.create(
        {
          type: 'express',
          country: user.country || 'US',
          email: user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: {
            skatriumUserId: user._id!.toString(),
            skatriumRole: role,
            skatriumProfileId: profile._id!.toString(),
          },
        },
        {
          idempotencyKey: profile.stripeIdempotencyKey,
        },
      );

      const telemetry = evaluateStripeAccountStatus(newAccount);

      await Model.findByIdAndUpdate(profile._id, {
        $set: {
          stripeConnectedAccountId: newAccount.id,
          accountCreationStatus: 'CREATED',
          accountCreationLastError: null,
          ...telemetry,
          stripeLastSyncedAt: new Date(),
        },
      });

      return newAccount;
    } catch (err: any) {
      // On network timeout or unknown API error, set RECOVERY_REQUIRED to reuse same operation keys
      const failureStatus =
        err.type === 'StripeConnectionError' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        err.status >= 500
          ? 'RECOVERY_REQUIRED'
          : 'FAILED';

      await Model.findByIdAndUpdate(profile._id, {
        $set: {
          accountCreationStatus: failureStatus,
          accountCreationLastError: {
            code: err.code || err.type || 'CREATION_ERROR',
            message: err.message || 'Failed to create Stripe account',
          },
        },
      });

      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `Stripe account creation failed: ${err.message}`,
      );
    }
  }

  /**
   * Main Onboarding Link Generation flow for Merchant / Organizer.
   */
  public async onboardSeller(
    userId: string,
    role: StripeSellerRole,
  ): Promise<IOnboardResponse> {
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Role-specific subscription entitlement authorization check
    if (role === 'MARCHANT') {
      assertMerchantRoleAccess(user);
    } else {
      assertOrganizerRoleAccess(user);
    }

    let profile = await this.getOrCreateProfile(userId, role);

    if (profile.accountCreationStatus === 'MANUAL_RECONCILIATION_REQUIRED') {
      throw new AppError(
        httpStatus.CONFLICT,
        'Multiple Stripe accounts match this profile. Manual reconciliation required before onboarding.',
      );
    }

    // Ensure Stripe Connected Account exists
    if (
      !profile.stripeConnectedAccountId ||
      profile.accountCreationStatus !== 'CREATED'
    ) {
      // Step A: Acquire operation lock & idempotency key
      const { profile: updatedProfile } = await this.acquireCreationOperation(
        profile._id!.toString(),
        role,
      );
      profile = updatedProfile;

      // Step B: Reconcile / Recover existing account if present
      let account = await this.reconcileOrRecoverAccount(profile, role);

      // Step C: If still no account, create via Stripe with persistent idempotency key
      if (!account) {
        account = await this.createStripeAccount(user, profile, role);
      }

      // Reload updated profile
      const Model = this.getModel(role);
      profile = (await Model.findById(profile._id))!;
    }

    // Generate single-use onboarding token
    const rawToken = onboardingTokenStore.createToken(
      user._id!.toString(),
      role,
      profile._id!.toString(),
    );

    const backendUrl =
      config.backend_url || `http://localhost:${config.port || 5005}`;
    const returnUrl =
      config.stripe.connect_return_url ||
      `${backendUrl}/api/v1/connect/return?token=${rawToken}`;
    const refreshUrl =
      config.stripe.connect_refresh_url ||
      `${backendUrl}/api/v1/connect/refresh?token=${rawToken}`;

    const stripe = getStripeClient();
    const accountLink = await stripe.accountLinks.create({
      account: profile.stripeConnectedAccountId!,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return {
      url: accountLink.url,
      accountCreationStatus: profile.accountCreationStatus,
      onboardingStatus: profile.onboardingStatus,
      stripeConnectedAccountId: profile.stripeConnectedAccountId!,
    };
  }

  /**
   * Retrieves deterministic status telemetry for Merchant or Organizer.
   */
  public async getSellerStatus(
    userId: string,
    role: StripeSellerRole,
  ): Promise<IStripeStatusResponse> {
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found');
    }

    if (role === 'MARCHANT') {
      assertMerchantRoleAccess(user);
    } else {
      assertOrganizerRoleAccess(user);
    }

    const Model = this.getModel(role);
    const profile = await Model.findOne({ user: userId });

    if (!profile || !profile.stripeConnectedAccountId) {
      return {
        role,
        stripeConnectedAccountId: null,
        accountCreationStatus: profile?.accountCreationStatus || 'NOT_STARTED',
        onboardingStatus: 'NOT_CREATED',
        detailsSubmitted: false,
        payoutsEnabled: false,
        transfersCapability: 'inactive',
        currentlyDue: [],
        pastDue: [],
        eventuallyDue: [],
        disabledReason: null,
        stripeLastSyncedAt: profile?.stripeLastSyncedAt || null,
      };
    }

    const stripe = getStripeClient();
    let telemetry;
    try {
      const stripeAccount = await stripe.accounts.retrieve(
        profile.stripeConnectedAccountId,
      );
      telemetry = evaluateStripeAccountStatus(stripeAccount);
    } catch (err: any) {
      console.error(
        `[StripeConnectService] Failed to retrieve Stripe account ${profile.stripeConnectedAccountId}: ${err.message}`,
      );
      telemetry = {
        onboardingStatus: 'STATUS_EVALUATION_ERROR' as const,
        detailsSubmitted: profile.detailsSubmitted,
        payoutsEnabled: profile.payoutsEnabled,
        transfersCapability: profile.transfersCapability,
        currentlyDue: profile.currentlyDue,
        pastDue: profile.pastDue,
        eventuallyDue: profile.eventuallyDue,
        disabledReason: profile.disabledReason || null,
      };
    }

    await Model.findByIdAndUpdate(profile._id, {
      $set: {
        ...telemetry,
        stripeLastSyncedAt: new Date(),
      },
    });

    return {
      role,
      stripeConnectedAccountId: profile.stripeConnectedAccountId,
      accountCreationStatus: profile.accountCreationStatus,
      onboardingStatus: telemetry.onboardingStatus,
      detailsSubmitted: telemetry.detailsSubmitted,
      payoutsEnabled: telemetry.payoutsEnabled,
      transfersCapability: telemetry.transfersCapability,
      currentlyDue: telemetry.currentlyDue,
      pastDue: telemetry.pastDue,
      eventuallyDue: telemetry.eventuallyDue,
      disabledReason: telemetry.disabledReason,
      stripeLastSyncedAt: new Date(),
    };
  }

  /**
   * Handles backend-controlled return URL upon onboarding completion.
   */
  public async handleReturn(rawToken: string): Promise<string> {
    const payload = onboardingTokenStore.consumeToken(rawToken);
    if (!payload) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid, expired, or already consumed onboarding token.',
      );
    }

    // Refresh telemetry
    const statusResult = await this.getSellerStatus(
      payload.userId,
      payload.role,
    );

    const baseUrl = config.frontend_url || 'https://skatrium.com';
    return `${baseUrl}/stripe-connect-callback?status=${statusResult.onboardingStatus}&role=${payload.role}`;
  }

  /**
   * Handles backend-controlled refresh URL when onboarding link expires.
   */
  public async handleRefresh(rawToken: string): Promise<string> {
    const payload = onboardingTokenStore.consumeToken(rawToken);
    if (!payload) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid, expired, or already consumed onboarding token.',
      );
    }

    // Re-generate fresh onboarding link
    const onboardResult = await this.onboardSeller(
      payload.userId,
      payload.role,
    );
    return onboardResult.url;
  }
}

export const stripeConnectService = new StripeConnectService();
