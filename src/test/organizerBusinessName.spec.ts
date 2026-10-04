import { registerZodSchema } from '../app/modules/auth/auth.validation';
import User from '../app/modules/user/user.model';

const registration = {
  fullName: 'Test Organizer',
  email: 'organizer@example.com',
  password: 'password123',
  country: 'Bangladesh',
  role: 'ORGANIZER',
  organizerLegalLink: 'https://example.com/legal',
  termsAccepted: true,
};

describe('organizer business name', () => {
  it.each([undefined, '', '   ', null, 123])('rejects invalid organizer business name %p', businessName => {
    expect(registerZodSchema.safeParse({ body: { ...registration, businessName } }).success).toBe(false);
  });

  it('accepts and trims a business name', () => {
    const result = registerZodSchema.parse({ body: { ...registration, businessName: '  Skate Events  ' } });
    expect(result.body.businessName).toBe('Skate Events');
  });

  it('does not require business names for ordinary users', () => {
    expect(registerZodSchema.safeParse({ body: { ...registration, role: 'USER' } }).success).toBe(true);
  });

  it('preserves business names in stored and serialized user profiles', () => {
    const user = new User({ ...registration, businessName: '  Skate Events  ' });
    expect(user.toObject().businessName).toBe('Skate Events');
    expect(user.toJSON().businessName).toBe('Skate Events');
  });
});
