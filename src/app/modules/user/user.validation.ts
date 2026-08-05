import { z } from 'zod';

export const accountSwitchValidation = z.object({
  body: z.object({
    role: z.enum(['ORGANIZER', 'KAATEDJ', 'MARCHANT', 'USER']),
  }),
});
// // Main user schema
// const createUserZodSchema = z.object({
//   body: z.object({
//     email: z.string().email(),
//     image: z
//       .object({
//         id: z.number(),
//         url: z.string().url(),
//       })
//       .optional(),
//     fullName: z.string().min(1),
//     password: z.string().min(6),
//     countryCode: z.string(),
//     phoneNumber: z.string(),
//     needsPasswordChange: z.boolean().optional(),
//     passwordChangedAt: z.coerce.date().optional(),
//     accountType: z
//       .enum(['custom', 'google', 'facebook'])
//       .optional()
//       .default('custom'),
//     // role: z.enum(Object.values(UserRole) as [string, ...string[]]),
//     isActive: z.boolean().optional().default(true),
//     isVerified: z.boolean().optional().default(false),
//     isDeleted: z.boolean().optional().default(false),
//     verification: z
//       .object({
//         otp: z.number(),
//         expiresAt: z.coerce.date(),
//         status: z.boolean(),
//       })
//       .optional(),
//   }),
// });

// const userValidation = {
//   createUserZodSchema,
// };

// export default userValidation;

const createUserZodSchema = z
  .object({
    body: z.object({
      email: z.string().email(),
      image: z
        .object({
          id: z.number(),
          url: z.string().url(),
        })
        .optional(),
      fullName: z.string().min(1),
      password: z.string().min(6).optional(), // social login optional
      countryCode: z.string().optional(),
      phoneNumber: z.string().optional(),
      needsPasswordChange: z.boolean().optional(),
      passwordChangedAt: z.coerce.date().optional(),
      accountType: z
        .enum(['emailvarifi', 'google', 'facebook', 'linkedin', 'apple'])
        .optional()
        .default('emailvarifi'),
      isActive: z.boolean().optional().default(true),
      isVerified: z.boolean().optional().default(false),
      isDeleted: z.boolean().optional().default(false),
      verification: z
        .object({
          otp: z.number(),
          expiresAt: z.coerce.date(),
          status: z.boolean(),
        })
        .optional(),
    }),
  })
  .refine(
    data => {
      // local signup হলে সব field required
      if (data.body.accountType === 'emailvarifi') {
        return (
          data.body.password &&
          data.body.phoneNumber &&
          data.body.countryCode &&
          data.body.fullName
        );
      }
      // social login এ skip
      return true;
    },
    {
      message: 'Local signup requires password, phoneNumber, and countryCode',
      path: ['body'], // error location
    },
  );

export default createUserZodSchema;
