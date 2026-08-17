import jwt, { JwtPayload, Secret } from 'jsonwebtoken';
import config from '../../config';
import AppError from '../../error/AppError';

import { createToken, verifyToken } from './auth.utils';
import {
  TchangePassword,
  Tlogin,
  TRegister,
  TresetPassword,
  VerifyOtpPayload,
} from './user.interface';
import httpStatus from 'http-status';
import { generateOtp } from '../../utils/otpGenerator';
import moment from 'moment';
import { sendEmail, addContactToBrevo } from '../../utils/mailSender';
import bcrypt from 'bcrypt';
import { UserRole } from '../user/user.interface';
import User from '../user/user.model';
import catchAsync from '../../utils/catchAsync';
import { PendingWebSubscription } from '../webhook/PendingWebSubscription.model';
import { webhookService } from '../webhook/webhook.service';

// otpCache: in-memory Map or Redis
const otpCache = new Map<
  string,
  { payload: TRegister; otp: number; expiresAt: Date }
>();

const pendingRegistrations = new Map<
  string,
  {
    payload: any;
    otp: string;
    otpExpires: Date;
  }
>();

export const register = async (payload: any) => {
  const { fullName, email, password } = payload;

  if (!email || !password || !fullName) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }
  if (password.length < 6) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password too short');
  }

  // const existingUser = await User.findOne({ email }).setOptions({
  //   skipFilter: true,
  // });

  // if (existingUser) {
  //   throw new AppError(
  //     httpStatus.BAD_REQUEST,
  //     'This email is already registered in our system.',
  //   );
  // }

  const otp = String(generateOtp());
  const expiresAt = moment().add(10, 'minute').toDate();

  pendingRegistrations.set(email, {
    payload,
    otp,
    otpExpires: expiresAt,
  });

  // ✅ OTP Verification Email
  await sendEmail(
    email,
    'Verify your Skatrium account',
    `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:36px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">Skatrium</h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;"> Platform</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;">Verify Your Email Address</h2>
                <p style="margin:0 0 28px;color:#555;font-size:15px;line-height:1.6;">
                  Hi <strong>${fullName}</strong>, thanks for signing up! Use the code below to verify your email address.
                </p>

                <!-- OTP Box -->
                <div style="background:#f0efff;border:2px dashed #4F46E5;border-radius:10px;padding:24px;text-align:center;margin-bottom:28px;">
                  <p style="margin:0 0 8px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Your Verification Code</p>
                  <h1 style="margin:0;font-size:42px;letter-spacing:14px;color:#4F46E5;font-weight:800;">${otp}</h1>
                </div>

                <p style="margin:0 0 8px;color:#888;font-size:13px;text-align:center;">
                  ⏳ This code will expire in <strong>10 minutes</strong>.
                </p>
                <p style="margin:0;color:#888;font-size:13px;text-align:center;">
                  Do not share this code with anyone.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;text-align:center;">
                <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
                  If you didn't create a Skatrium account, you can safely ignore this email.<br/>
                  © ${new Date().getFullYear()} Skatrium. All rights reserved.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `,
  );

  return {
    message: 'Verification code sent to your email',
    email,
  };
};

export const verifyEmailregister = async (email: string, code: string) => {
  const pending = pendingRegistrations.get(email);

  if (!pending) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No pending registration found for this email or code expired',
    );
  }

  if (String(pending.otp) !== String(code)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid verification code');
  }

  if (pending.otpExpires < new Date()) {
    pendingRegistrations.delete(email);
    throw new AppError(httpStatus.BAD_REQUEST, 'Verification code has expired');
  }

  const doubleCheckUser = await User.findOne({ email });
  if (doubleCheckUser && doubleCheckUser.isVerified) {
    pendingRegistrations.delete(email);
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'User already exists with this email',
    );
  }

  const {
    fullName,
    password,
    country,
    role,
    howDidYouHear,
    subscribeToEmails,
    termsAccepted,
    accountType,
    djname,
  } = pending.payload;

  const user = await User.create({
    fullName,
    email,
    password,
    country,
    role,
    howDidYouHear,
    subscribeToEmails,
    termsAccepted,
    accountType: accountType || 'emailvarifi',
    djname,
    isVerified: true,
  });

  if (subscribeToEmails) {
    // Note: addContactToBrevo is imported from mailSender
    await addContactToBrevo(email, fullName);
  }

  pendingRegistrations.delete(email);

  // 🚀 Resolve Pending Web Subscriptions for this new user
  try {
    const pendingSub = await PendingWebSubscription.findOne({ email: email.toLowerCase(), status: 'ACTIVE' });
    if (pendingSub) {
      // Re-trigger the webhook logic for this grant
      await webhookService.handleWixWebhook({
        email: pendingSub.email,
        plan_id: pendingSub.plan_id,
        status: 'PAYMENT_COMPLETED' // forces a grant
      });
      // Clear the pending record
      await PendingWebSubscription.findByIdAndDelete(pendingSub._id);
    }
  } catch (err) {
    console.error('Error resolving pending web subscription for new user:', err);
  }

  try {
    await sendEmail(
      email,
      "Welcome to Skatrium – You're all set! 🎉",
      `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:36px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">Skatrium </h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Platform</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;">🎉 Registration Successful!</h2>
                <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
                  Hi <strong>${fullName}</strong>, your Skatrium account has been successfully created and verified. You're now ready to get started!
                </p>

                <!-- Info Box -->
                <div style="background:#f0efff;border-left:4px solid #4F46E5;border-radius:6px;padding:16px 20px;margin-bottom:28px;">
                  <p style="margin:0 0 6px;color:#333;font-size:14px;"><strong>📧 Email:</strong> ${email}</p>
                  <p style="margin:0;color:#333;font-size:14px;"><strong>✅ Status:</strong> Verified</p>
                </div>

                <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6;">
                 You can now log in to your account and explore all the powerful  has to offer.
                </p>

             
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;text-align:center;">
                <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
                 
                  © ${new Date().getFullYear()} Skatrium. All rights reserved.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `,
    );
  } catch (error) {
    console.log(error);
  }

  const jwtPayload = {
    userId: user._id.toString(),
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    config.jwt.jwt_access_secret as string,
    config.jwt.jwt_access_expires_in as string,
  );

  return {
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
    },
    accessToken,
  };
};

export const resendOtpregister = async (email: string) => {
  const pending = pendingRegistrations.get(email);

  if (!pending) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No pending registration found for this email. Please register again.',
    );
  }

  const doubleCheckUser = await User.findOne({ email });
  if (doubleCheckUser && doubleCheckUser.isVerified) {
    pendingRegistrations.delete(email);
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'User already exists with this email',
    );
  }

  // Optional: prevent spam — only allow resend once previous OTP is past halfway expired
  // (10 min total, so block resend within first 1 minute of generating old OTP)
  const otpAgeMs = 10 * 60 * 1000 - (pending.otpExpires.getTime() - Date.now());
  if (otpAgeMs < 60 * 1000) {
    throw new AppError(
      httpStatus.TOO_MANY_REQUESTS,
      'Please wait a moment before requesting a new code',
    );
  }

  const otp = String(generateOtp());
  const expiresAt = moment().add(10, 'minute').toDate();

  pendingRegistrations.set(email, {
    payload: pending.payload,
    otp,
    otpExpires: expiresAt,
  });

  const fullName = pending.payload.fullName;

  await sendEmail(
    email,
    'Your new Skatrium verification code',
    `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:36px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">Skatrium</h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Platform</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;">Here's Your New Code</h2>
                <p style="margin:0 0 28px;color:#555;font-size:15px;line-height:1.6;">
                  Hi <strong>${fullName}</strong>, you requested a new verification code. Use the code below to verify your email address.
                </p>

                <!-- OTP Box -->
                <div style="background:#f0efff;border:2px dashed #4F46E5;border-radius:10px;padding:24px;text-align:center;margin-bottom:28px;">
                  <p style="margin:0 0 8px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Your Verification Code</p>
                  <h1 style="margin:0;font-size:42px;letter-spacing:14px;color:#4F46E5;font-weight:800;">${otp}</h1>
                </div>

                <p style="margin:0 0 8px;color:#888;font-size:13px;text-align:center;">
                  ⏳ This code will expire in <strong>10 minutes</strong>.
                </p>
                <p style="margin:0;color:#888;font-size:13px;text-align:center;">
                  Do not share this code with anyone.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;text-align:center;">
                <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
                  If you didn't request this, you can safely ignore this email.<br/>
                  © ${new Date().getFullYear()} Skatrium. All rights reserved.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `,
  );

  return {
    message: 'A new verification code has been sent to your email',
    email,
  };
};

//change password
const changePassword = async (id: string, payload: TchangePassword) => {
  const user = await User.IsUserExistbyId(id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const isOldPasswordValid = await User.isPasswordMatched(
    payload.oldPassword,
    user.password,
  );

  if (!isOldPasswordValid) {
    throw new AppError(httpStatus.FORBIDDEN, 'Old password does not match!');
  }

  if (payload.newPassword !== payload.confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'New password and confirm password do not match!',
    );
  }

  const isSameAsOld = await User.isPasswordMatched(
    payload.newPassword,
    user.password,
  );

  if (isSameAsOld) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'New password cannot be same as old password!',
    );
  }

  const hashedPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const result = await User.findByIdAndUpdate(
    id,
    {
      $set: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    },
    { new: true },
  );

  return result;
};

// forgot password

const forgotPassword = async (email: string) => {
  const user = await User.isUserExist(email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'user not found ');
  }
  if (user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'user not found');
  }
  if (user?.status === 'blocked') {
    throw new AppError(httpStatus.FORBIDDEN, 'your account is inactive');
  }
  const jwtPayload = {
    email: email,
    id: user?._id.toString(),
  };
  const token = jwt.sign(jwtPayload, config.jwt.jwt_access_secret as Secret, {
    expiresIn: '5m',
  });
  const currentTime = new Date();
  const otp = generateOtp();
  const expiresAt = moment(currentTime).add(5, 'minute');
  await User.findByIdAndUpdate(user?._id, {
    verification: {
      otp,
      expiresAt,
    },
  });
  await sendEmail(
    email,
    'your reset password otp is:',
    `<div><h5>your otp is: ${otp}</h5>
    <p>valid for:${expiresAt.toLocaleString()}</p>
    </div>`,
  );
  // send the mail here
  return { email, token };
};

const resetPassword = async (token: string, payload: TresetPassword) => {
  let decode;
  try {
    decode = jwt.verify(
      token,
      config.jwt.jwt_access_secret as string,
    ) as JwtPayload;
  } catch (err) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Session has exipired. please try again',
    );
  }
  const user = await User.findById(decode?.id).select('isDeleted verification');

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'user not found');
  }
  if (new Date() > user?.verification?.expiresAt) {
    throw new AppError(httpStatus.FORBIDDEN, 'sessions expired');
  }
  if (!user?.verification?.status) {
    throw new AppError(httpStatus.FORBIDDEN, 'Otp is not verified yet!');
  }
  if (payload?.newPassword !== payload?.confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'New password and Confirm password do not match!',
    );
  }
  const hashedPassword = await bcrypt.hash(
    payload?.newPassword,
    Number(config.bcrypt_salt_rounds),
  );
  const result = await User.findByIdAndUpdate(decode?.id, {
    password: hashedPassword,
    passwordChangedAt: new Date(),
    verification: {
      otp: 0,
      status: false,
    },
  });
  return result;
};

const refreshToken = async (token: string) => {
  // checking if the given token is valid
  console.log('hitted');
  const decoded = verifyToken(token, config.jwt.jwt_refresh_secret as string);
  const { userId } = decoded;
  console.log(decoded);
  const user = await User.IsUserExistbyId(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !');
  }
  const isDeleted = user?.isDeleted;

  if (isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted !');
  }
  // checking if the user is blocked
  const userStatus = user?.status;

  if (userStatus === 'blocked') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked ! !');
  }

  const jwtPayload = {
    userId: user.id!,
    role: user.role!,
  };

  const accessToken = createToken(
    jwtPayload,
    config.jwt.jwt_access_secret as string,
    config.jwt.jwt_access_expires_in as string,
  );

  return {
    accessToken,
  };
};

// OTP cache for password reset
const passwordResetOtpCache = new Map<
  string,
  { otp: number; expiresAt: Date }
>();

export const sendVerificationCode = async (email: string) => {
  const user = await User.isUserExist(email);
  if (!user) throw new AppError(404, 'Email not found');

  const otp = generateOtp();
  const expiresAt = moment().add(10, 'minute').toDate();

  passwordResetOtpCache.set(email, { otp, expiresAt });

  await sendEmail(
    email,
    'Password Reset OTP',
    `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
    <!-- Email Container -->
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; padding: 30px; text-align: center; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">

      <!-- Logo -->
      <img src="https://yourdomain.com/logo.png" alt="Your Logo" style="width: 120px; margin-bottom: 20px;" />

      <!-- Heading -->
      <h2 style="color: #333;">Password Reset OTP</h2>
      <p style="color: #555; font-size: 16px;">Use the OTP below to reset your password. It is valid for 10 minutes.</p>

      <!-- OTP Box with animation -->
      <div style="
        display: inline-block;
        padding: 15px 25px;
        font-size: 32px;
        letter-spacing: 8px;
        color: #fff;
        background: #4CAF50;
        border-radius: 8px;
        font-weight: bold;
        margin: 20px 0;
        animation: pulse 1.5s infinite;
      ">
        ${otp}
      </div>

      <!-- Expiry info -->
      <p style="color: #888; font-size: 14px;">Valid till: ${expiresAt.toLocaleString()}</p>

      <!-- Footer -->
      <p style="color: #aaa; font-size: 12px; margin-top: 30px;">If you did not request this, please ignore this email.</p>
    </div>
  </div>

  <!-- Animation keyframes -->
  <style>
    @keyframes pulse {
      0% { transform: scale(1); box-shadow: 0 0 5px #4CAF50; }
      50% { transform: scale(1.05); box-shadow: 0 0 15px #4CAF50; }
      100% { transform: scale(1); box-shadow: 0 0 5px #4CAF50; }
    }
  </style>
  `,
  );

  return otp;
};

// Verified users map (email → VERIFIED)
export const verifiedUsers = new Map<string, string>();

// 2️⃣ Verify OTP
export const userVerifyOtp = async (email: string, otpInput: number) => {
  const user = await User.findOne({ email });
  if (!user || !user.verification)
    throw new AppError(400, 'OTP not found or expired');

  // if (user.verification.status) throw new AppError(400, 'OTP already verified');

  // if (user.verification.otp !== otpInput) throw new AppError(400, 'Invalid OTP');

  // if (moment().isAfter(user.verification.expiresAt)) throw new AppError(400, 'OTP expired');

  // Mark verified
  user.verification.status = true;
  await user.save();

  // Save in-memory for password reset API
  verifiedUsers.set(email, 'VERIFIED');

  return { email };
};

export const userResetPasswordService = async (
  email: string,
  newPassword: string,
) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!user.verification || user.verification.status !== true) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP not verified');
  }

  // ✅ set new password
  user.password = newPassword;

  // ✅ clear OTP data
  //  user.verification = {
  //   otp: 0,
  //   expiresAt: null,
  //   status: false,
  // } as any;

  if (!user.verification) {
    user.verification = {} as any;
  }
  user.verification.otp = 0;
  user.verification.expiresAt = new Date(0);
  user.verification.status = false;

  await user.save();

  return null;
};

//forgot password এর জন্য OTP verify করার পরে password set করার জন্য এই service টা ব্যবহার করব।

const Enteryouremail = async (email: string) => {
  const user = await User.findOne({ email });

  if (!user) throw new AppError(404, 'Email not found or not verified');

  const otp = generateOtp();
  const expiresAt = moment().add(10, 'minutes').toDate();

  passwordResetOtpCache.set(email, { otp, expiresAt });

  try {
    await sendEmail(
      email,
      'Password Reset OTP',
      `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
    <!-- Email Container -->
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; padding: 30px; text-align: center; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">

      <!-- Logo -->
      <img src="https://yourdomain.com/logo.png" alt="Your Logo" style="width: 120px; margin-bottom: 20px;" />

      <!-- Heading -->
      <h2 style="color: #333;">Password Reset OTP</h2>
      <p style="color: #555; font-size: 16px;">Use the OTP below to reset your password. It is valid for 10 minutes.</p>

      <!-- OTP Box with animation -->
      <div style="
        display: inline-block;
        padding: 15px 25px;
        font-size: 32px;
        letter-spacing: 8px;
        color: #fff;
        background: #4CAF50;
        border-radius: 8px;
        font-weight: bold;
        margin: 20px 0;
        animation: pulse 1.5s infinite;
      ">
        ${otp}
      </div>

      <!-- Expiry info -->
      <p style="color: #888; font-size: 14px;">Valid till: ${expiresAt.toLocaleString()}</p>

      <!-- Footer -->
      <p style="color: #aaa; font-size: 12px; margin-top: 30px;">If you did not request this, please ignore this email.</p>
    </div>
  </div>

  <!-- Animation keyframes -->
  <style>
    @keyframes pulse {
      0% { transform: scale(1); box-shadow: 0 0 5px #4CAF50; }
      50% { transform: scale(1.05); box-shadow: 0 0 15px #4CAF50; }
      100% { transform: scale(1); box-shadow: 0 0 5px #4CAF50; }
    }
  </style>
  `,
    );
  } catch (err) {
    throw new AppError(500, 'Failed to send OTP email');
  }

  return { message: 'OTP sent successfully to your email' };
};

const verifyOtp = (email: string, inputOtp: number) => {
  const record = passwordResetOtpCache.get(email);
  if (!record) throw new AppError(400, 'No OTP found for this email');

  if (record.expiresAt < new Date()) {
    passwordResetOtpCache.delete(email);
    throw new AppError(400, 'OTP expired');
  }

  if (record.otp !== inputOtp) throw new AppError(400, 'Invalid OTP');

  // OTP verified → remove from cache
  // passwordResetOtpCache.delete(email);
  return true;
};

export const verifyOtpAndResetPassword = catchAsync(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // ✅ validation
  if (!email || !otp || !newPassword)
    throw new AppError(400, 'Email, OTP and newPassword are required');

  // ✅ cache check
  const record = passwordResetOtpCache.get(email);
  if (!record) throw new AppError(400, 'No OTP found for this email');

  // ✅ expiry check
  if (record.expiresAt < new Date()) {
    passwordResetOtpCache.delete(email);
    throw new AppError(400, 'OTP expired');
  }

  // ✅ otp match check
  if (record.otp !== Number(otp)) throw new AppError(400, 'Invalid OTP');

  // ✅ cache clear
  passwordResetOtpCache.delete(email);

  // ✅ user check
  const user = await User.findOne({ email });
  if (!user) throw new AppError(404, 'User not found');

  // ✅ password hash - manually করছি কারণ findOneAndUpdate use করবো
  const saltRounds = Number(config.bcrypt_salt_rounds) || 12;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  // ✅ update - pre('save') trigger হবে না, double hash হবে না
  await User.findOneAndUpdate(
    { email },
    { password: hashedPassword },
    { new: true },
  );

  res.status(200).json({
    success: true,
    message: 'Password reset successfully',
  });
});

export const changeLanguage = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { language } = req.body;

  if (!language) {
    throw new AppError(400, 'Language is required');
  }

  if (!['en', 'ar'].includes(language)) {
    throw new AppError(400, 'Invalid language');
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { language },
    { new: true },
  );

  res.status(200).json({
    success: true,
    message: 'Language updated successfully',
    data: user,
  });
});

export const authServices = {
  register,

  // login,
  Enteryouremail,
  verifyOtp,
  verifyOtpAndResetPassword,

  userVerifyOtp,
  sendVerificationCode,
  changePassword,
  forgotPassword,
  resetPassword,
  refreshToken,
  changeLanguage,
  verifyEmailregister,
};
