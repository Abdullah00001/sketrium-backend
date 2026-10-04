import { OrganizerProfile } from '../app/modules/organizerProfile/organizerProfile.model';
import User from '../app/modules/user/user.model';
import { StripeConnectService } from '../app/modules/stripeConnect/stripeConnect.service';
import { setStripeClient } from '../app/utils/stripeClient';
import { onboardingTokenStore } from '../app/modules/stripeConnect/stripeConnect.tokenStore';

describe('onboarding an already CREATED connected account', () => {
  let service: StripeConnectService;
  let stripe: any;

  beforeEach(() => {
    service = new StripeConnectService();
    jest.spyOn(User, 'findById').mockResolvedValue({
      _id: 'user-id', isPremium: true, isDeleted: false,
    } as any);
    jest.spyOn(service, 'getOrCreateProfile').mockResolvedValue({
      _id: 'profile-id', stripeConnectedAccountId: 'acct_existing',
      accountCreationStatus: 'CREATED', onboardingStatus: 'ONBOARDING_REQUIRED',
    } as any);
    jest.spyOn(service, 'acquireCreationOperation');
    jest.spyOn(service, 'createStripeAccount');
    jest.spyOn(onboardingTokenStore, 'createToken').mockReturnValue('test-token');
    stripe = {
      accounts: {
        retrieve: jest.fn().mockResolvedValue({ id: 'acct_existing', capabilities: {} }),
        update: jest.fn().mockResolvedValue({ id: 'acct_existing' }),
      },
      accountLinks: { create: jest.fn().mockResolvedValue({ url: 'https://connect.stripe.com/test' }) },
    };
    setStripeClient(stripe);
  });

  it.each(['ORGANIZER', 'MARCHANT'] as const)('repairs a CREATED %s account before making the link', async role => {
    await service.onboardSeller('user-id', role);
    expect(stripe.accounts.retrieve).toHaveBeenCalledWith('acct_existing');
    expect(stripe.accounts.update).toHaveBeenCalledWith('acct_existing', {
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    });
    expect(stripe.accounts.update.mock.invocationCallOrder[0]).toBeLessThan(stripe.accountLinks.create.mock.invocationCallOrder[0]);
    expect(stripe.accountLinks.create).toHaveBeenCalledWith(expect.objectContaining({ account: 'acct_existing' }));
    expect(service.acquireCreationOperation).not.toHaveBeenCalled();
    expect(service.createStripeAccount).not.toHaveBeenCalled();
  });

  it('leaves active capabilities alone', async () => {
    stripe.accounts.retrieve.mockResolvedValue({ id: 'acct_existing', capabilities: { card_payments: 'active', transfers: 'active' } });
    await service.onboardSeller('user-id', 'ORGANIZER');
    expect(stripe.accounts.update).not.toHaveBeenCalled();
    expect(stripe.accountLinks.create).toHaveBeenCalledTimes(1);
  });

  it('requests only the capability that needs repair', async () => {
    stripe.accounts.retrieve.mockResolvedValue({ id: 'acct_existing', capabilities: { card_payments: 'active' } });
    await service.onboardSeller('user-id', 'ORGANIZER');
    expect(stripe.accounts.update).toHaveBeenCalledWith('acct_existing', { capabilities: { transfers: { requested: true } } });
  });

  it('does not create a link when capability repair fails', async () => {
    stripe.accounts.update.mockRejectedValue(new Error('Capability unavailable'));
    await expect(service.onboardSeller('user-id', 'ORGANIZER')).rejects.toMatchObject({ statusCode: 502 });
    expect(stripe.accountLinks.create).not.toHaveBeenCalled();
  });

  it('does not create a replacement account when retrieval fails', async () => {
    stripe.accounts.retrieve.mockRejectedValue(new Error('Stripe unavailable'));
    await expect(service.onboardSeller('user-id', 'ORGANIZER')).rejects.toThrow('Stripe unavailable');
    expect(service.createStripeAccount).not.toHaveBeenCalled();
    expect(stripe.accountLinks.create).not.toHaveBeenCalled();
  });
  it.each([true, false])('preserves the recovery/creation path (recovered: %s)', async recovered => {
    const pending = { _id: 'profile-id', accountCreationStatus: 'NOT_STARTED' } as any;
    jest.mocked(service.getOrCreateProfile).mockResolvedValue(pending);
    jest.mocked(service.acquireCreationOperation).mockResolvedValue({ profile: pending, isOwner: true });
    jest.spyOn(service, 'reconcileOrRecoverAccount').mockResolvedValue(
      recovered ? { id: 'acct_existing', capabilities: {} } : null,
    );
    jest.mocked(service.createStripeAccount).mockResolvedValue({ id: 'acct_existing', capabilities: {} });
    jest.spyOn(OrganizerProfile, 'findById').mockResolvedValue({
      ...pending, accountCreationStatus: 'CREATED', stripeConnectedAccountId: 'acct_existing',
    });
    await service.onboardSeller('user-id', 'ORGANIZER');
    expect(stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(service.createStripeAccount).toHaveBeenCalledTimes(recovered ? 0 : 1);
    expect(stripe.accounts.update).toHaveBeenCalledTimes(recovered ? 1 : 0);
    expect(stripe.accountLinks.create).toHaveBeenCalledTimes(1);
  });

});
