import crypto from 'crypto';
import config from '../../config';
import { IOnboardingTokenPayload, StripeSellerRole } from './stripeConnect.interface';

// In-memory atomic map for single-use token storage with TTL
interface StoredToken {
  payload: IOnboardingTokenPayload;
  expiresAt: number;
}

class TokenStore {
  private store = new Map<string, StoredToken>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Periodic garbage collection for expired unconsumed tokens
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, val] of this.store.entries()) {
        if (val.expiresAt <= now) {
          this.store.delete(key);
        }
      }
    }, 60000);
    // Unref cleanup timer so it does not block process exit during tests
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Generates a signed, single-use onboarding token.
   * Token format: `${tokenId}.${signature}`
   */
  public createToken(
    userId: string,
    role: StripeSellerRole,
    profileId: string,
    ttlMs: number = 15 * 60 * 1000,
  ): string {
    const tokenId = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + ttlMs;

    const payload: IOnboardingTokenPayload = {
      tokenId,
      userId,
      role,
      profileId,
      expiresAt,
    };

    const signature = this.signPayload(tokenId, expiresAt);
    const rawToken = `${tokenId}.${signature}`;

    this.store.set(tokenId, {
      payload,
      expiresAt,
    });

    return rawToken;
  }

  /**
   * Atomically gets and consumes (deletes) the single-use token.
   * Concurrent calls for the same token will fail as token is deleted on first retrieval.
   */
  public consumeToken(rawToken: string): IOnboardingTokenPayload | null {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const parts = rawToken.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [tokenId, signature] = parts;
    const entry = this.store.get(tokenId);

    // Atomic consumption: immediately delete entry
    if (entry) {
      this.store.delete(tokenId);
    } else {
      return null;
    }

    // Verify expiration
    if (entry.expiresAt <= Date.now()) {
      return null;
    }

    // Verify signature
    const expectedSignature = this.signPayload(tokenId, entry.expiresAt);
    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedSigBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      sigBuffer.length !== expectedSigBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
    ) {
      return null;
    }

    return entry.payload;
  }

  private signPayload(tokenId: string, expiresAt: number): string {
    const secret = config.stripe.connect_token_secret;
    if (!secret || secret.trim() === '') {
      throw new Error(
        'Configuration Error: STRIPE_CONNECT_TOKEN_SECRET is missing and mandatory.',
      );
    }
    return crypto
      .createHmac('sha256', secret)
      .update(`${tokenId}:${expiresAt}`)
      .digest('hex');
  }

  public clear(): void {
    this.store.clear();
  }
}

export const onboardingTokenStore = new TokenStore();
