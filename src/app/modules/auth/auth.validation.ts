
import { z } from 'zod';
import { UserRole } from '../user/user.interface';

// const loginZodSchema = z.object({
//   body: z.object({
//     email: z.string({ required_error: 'Email is required' }).email(),
//     password: z.string({ required_error: 'Password is required' }),
//   }),
// });

// const refreshTokenValidationSchema = z.object({
//   body: z.object({
//     refreshToken: z.string({ required_error: 'Refresh token is required' }),
//   }),
// });

// const changePasswordZodSchema = z.object({
//   body: z.object({
//     oldPassword: z.string({ required_error: 'Old password is required' }),
//     newPassword: z
//       .string({ required_error: 'New password is required' })
//       .min(6, 'Password must be at least 6 characters'),
//   }),
// });

// const resetPasswordZodSchema = z
//   .object({
//     body: z.object({
//       newPassword: z
//         .string({ required_error: 'New password is required' })
//         .min(6, 'Password must be at least 6 characters'),
//       confirmPassword: z.string({
//         required_error: 'Confirm password is required',
//       }),
//     }),
//   })
//   .refine((data) => data.body.newPassword === data.body.confirmPassword, {
//     message: 'Passwords do not match',
//     path: ['body.confirmPassword'],
//   });

// const forgotPasswordZodSchema = z.object({
//   body: z.object({
//     email: z.string().email({ message: 'Must be a valid email address' }),
//   }),
// });

// const deleteAccountZodSchema = z.object({
//   body: z.object({
//     password: z.string({ required_error: 'Password is required' }),
//   }),
// });

// export const registerZodSchema = z.object({
//   body: z.object({
//     email: z
//       .string()
//       .nonempty('Email is required')
//       .email('Must be a valid email'),

//     password: z
//       .string()
//       .nonempty('Password is required')
//       .min(6, 'Password must be at least 6 characters'),

//     fullName: z
//       .string()
//       .nonempty('Full name is required'),

//     phoneNumber: z
//       .string()
//       .nonempty('Phone number is required'),

//     countryCode: z
//       .string()
//       .nonempty('Country code is required'),

//     // gender: z
//     //   .enum(['Male', 'Female'], {
//     //     required_error: 'Gender is required',
//     //   }),
//   }),
// });

export const requestOtpZodSchema = z.object({
  body: z.object({
    email: z.string().nonempty('Email is required').email('Must be a valid email'),
  }),
});




export const registerZodSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, "Full name is required"),

    email: z.string().email("Invalid email format"),

    password: z.string().min(6, "Password must be at least 6 characters"),

    country: z.string().min(1, "Country is required"),

    role: z.enum([
      UserRole.admin,
      UserRole.USER,
     
    ]),

    howDidYouHear: z.string().optional(),

    subscribeToEmails: z.boolean().optional().default(false),

    termsAccepted: z.boolean().refine((val) => val === true, {
      message: "Terms must be accepted",
    }),
  }),
});






export const verifyEmailZodSchema = z.object({
  body: z.object({
    email: z
      .string()
      .nonempty('Email is required')
      .email('Must be a valid email'),

    otp: z
      .number()
      .refine((val) => val !== undefined && val !== null, {
        message: 'OTP is required',
      }),
  }),
});

export const verifyEmailZodSchemar = z.object({
  body: z.object({
    email: z.string().nonempty('Email is required').email('Must be a valid email'),
    otp: z.number().refine(val => val !== undefined && val !== null, { message: 'OTP is required' }),
  }),
});

export const loginZodSchema = z.object({
  body: z.object({
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .email("Must be a valid email"),

    password: z
      .string()
      .min(1, "Password is required"),
  }),
});

export const refreshTokenValidationSchema = z.object({
  body: z.object({
    refreshToken: z.string().nonempty('Refresh token is required'),
  }),
});

export const changePasswordZodSchema = z.object({
  body: z.object({
    oldPassword: z.string().nonempty('Old password is required'),
    newPassword: z.string().nonempty('New password is required').min(6, 'Password must be at least 6 characters'),
  }),
});

export const resetPasswordZodSchema = z
  .object({
    body: z.object({
      newPassword: z.string().nonempty('New password is required').min(6, 'Password must be at least 6 characters'),
      confirmPassword: z.string().nonempty('Confirm password is required'),
    }),
  })
  .refine((data) => data.body.newPassword === data.body.confirmPassword, {
    message: 'Passwords do not match',
    path: ['body.confirmPassword'],
  });

export const forgotPasswordZodSchema = z.object({
  body: z.object({
    email: z.string().nonempty('Email is required').email('Must be a valid email address'),
  }),
});

export const deleteAccountZodSchema = z.object({
  body: z.object({
    password: z.string().nonempty('Password is required'),
  }),
});



export const setPasswordValidationSchema = z
  .object({
    body: z.object({
      email: z
        .string()
        .nonempty('Email is required')
        .email('Must be a valid email'),

      newPassword: z
        .string()
        .nonempty('New password is required')
        .min(6, 'Password must be at least 6 characters')
        .max(12, 'Password must not exceed 12 characters')
        .regex(
          /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]+$/,
          'Password must contain at least 1 letter and 1 number',
        ),

      confirmPassword: z
        .string()
        .nonempty('Confirm password is required'),
    }),
  })
  .refine((data) => data.body.newPassword === data.body.confirmPassword, {
    message: 'Passwords do not match',
    path: ['body.confirmPassword'],
  });





export const authValidation = {
  verifyEmailZodSchemar,
  requestOtpZodSchema,
  registerZodSchema,
  verifyEmailZodSchema,
  loginZodSchema,
  setPasswordValidationSchema,
  refreshTokenValidationSchema,
  changePasswordZodSchema,
  resetPasswordZodSchema,
  forgotPasswordZodSchema,
  deleteAccountZodSchema,
};
