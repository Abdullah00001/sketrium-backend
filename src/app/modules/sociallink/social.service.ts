import AppError from '../../error/AppError';
import httpStatus from 'http-status';
import User from '../user/user.model';
import SocialLink from './soscial.model';
import { createToken } from '../auth/auth.utils';
import config from '../../config';
import {
  deleteFromS3,
  deleteManyFromS3,
  uploadToS3,
} from '../../utils/fileHelper';
import mongoose from 'mongoose';
import { JwtPayload } from 'jsonwebtoken';
import { Personalization } from '../Personalizationuser/Personalization.model';
import { generateOtp } from '../../utils/otpGenerator';
import moment from 'moment';
import { sendEmail } from '../../utils/mailSender';


import jsonwebtoken from 'jsonwebtoken';

// const register = async (payload: {
//   fullName: string;
//   email: string;
//   password: string;
//   confirmPassword: string;
//   role: string;
//   country?: string;
//   phoneNumber?: string;
//   howDidYouHear?: string;
//   subscribeToEmails?: boolean;
//   termsAccepted: boolean;

//   shopName?: string;
//   shopLink?: string;
//   facebook?: string;
//   instagram?: string;
//   linkedin?: string;
//   twitter?: string;
//   youtube?: string;
//   tiktok?: string;
//   website?: string;
// }) => {
//   const {
//     fullName,
//     email,
//     password,
//     confirmPassword,
//     role,
//     country,
//     phoneNumber,
//     howDidYouHear,
//     subscribeToEmails,
//     termsAccepted,

//     shopName,
//     shopLink,
//     facebook,
//     instagram,
//     linkedin,
//     twitter,
//     youtube,
//     tiktok,
//     website,
//   } = payload;

//   // ── Validations ─────────────────────────────────
//   if (!termsAccepted) {
//     throw new AppError(
//       httpStatus.BAD_REQUEST,
//       'You must accept the Terms and Conditions.',
//     );
//   }

//   if (password !== confirmPassword) {
//     throw new AppError(
//       httpStatus.BAD_REQUEST,
//       'Passwords do not match.',
//     );
//   }

//   if (password.length < 6) {
//     throw new AppError(
//       httpStatus.BAD_REQUEST,
//       'Password must be at least 6 characters long.',
//     );
//   }

//   // ── Duplicate check ─────────────────────────────
//   const existingEmail = await User.findOne({ email });
//   if (existingEmail) {
//     throw new AppError(
//       httpStatus.CONFLICT,
//       'An account with this email already exists.',
//     );
//   }

//   if (phoneNumber) {
//     const existingPhone = await User.findOne({ phoneNumber });
//     if (existingPhone) {
//       throw new AppError(
//         httpStatus.CONFLICT,
//         'An account with this phone number already exists.',
//       );
//     }
//   }

//   // ── PART 1: Create User ─────────────────────────
//   const user = await User.create({
//     fullName,
//     email,
//     password,
//     role,
//     country: country || undefined,
//     phoneNumber: phoneNumber || undefined,
//     howDidYouHear: howDidYouHear || '',
//     subscribeToEmails: subscribeToEmails ?? false,
//     termsAccepted,
//     accountType: 'emailvarifi',
//     isVerified: false,
//     isActive: true,
//     needsPasswordChange: false,
//   });

//   console.log("🚀 ~ file: social.controller.ts:122 ~ register ~ user:", user)
//   // ── PART 2: Create SocialLink (if provided) ─────
//   const hasSocialData =
//     shopName || shopLink || facebook || instagram ||
//     linkedin || twitter || youtube || tiktok || website;

//   if (hasSocialData) {
//     await SocialLink.create({
//       user: user._id,
//       shopName: shopName || '',
//       shopLink: shopLink || '',
//       facebook: facebook || '',
//       instagram: instagram || '',
//       linkedin: linkedin || '',
//       twitter: twitter || '',
//       youtube: youtube || '',
//       tiktok: tiktok || '',
//       website: website || '',
//     });
//   }

//   console.log("🚀 ~ file: social.controller.ts:149 ~ register ~ user._id:", hasSocialData)

//   // ── Generate Token ──────────────────────────────
//   const jwtPayload = {
//     userId: user?._id.toString(),
//     role: user?.role,
//   };

//   const accessToken = createToken(
//     jwtPayload,
//     config.jwt.jwt_access_secret as string,
//     config.jwt.jwt_access_expires_in as string,
//   );

//   return {
//     accessToken,
//     user: {
//       _id: user._id,
//       fullName: user.fullName,
//       email: user.email,
//       role: user.role,
//       isVerified: user.isVerified,
//     },
//   };
// };

const updateProfile = async (
  user: JwtPayload,
  body: Record<string, unknown>,
  files: Record<string, Express.Multer.File[]> | undefined,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userUpdateData: Record<string, unknown> = {};

    const userFields = [
      'fullName',
      'phoneNumber',
      'country',
      'djname',
      'about',
      'language',
      'howDidYouHear',
      'subscribeToEmails',
    ];
    for (const field of userFields) {
      if (body[field] !== undefined) {
        userUpdateData[field] = body[field];
      }
    }

    // 🛠️ ডুপ্লিকেট কি এরর (E11000) দূর করার লজিক 
    // phoneNumber ফাঁকা স্ট্রিং ("") অথবা null হলে সেটা ডাটাবেজে পাঠানো বন্ধ করবে
    // if (userUpdateData.phoneNumber === "") {
    //   delete userUpdateData.phoneNumber;
    // }

    // ─── Profile Image ───────────────────────────────────────
    if (files?.profileImage?.[0]) {
      const existingUser = await User.findById(user.id);

      if (existingUser?.image?.id) {
        await deleteFromS3(String(existingUser.image.id)); // ✅ single string
      }

      const uploaded = await uploadToS3(
        files.profileImage[0],
        'profile-images',
      );
      userUpdateData['image'] = {
        id: uploaded.id,
        url: uploaded.url,
      };
    }

    // ─── Cover Image ─────────────────────────────────────────
    if (files?.coverImage?.[0]) {
      const existingUser = await User.findById(user.id);

      if (existingUser?.coverImage?.id) {
        await deleteFromS3(String(existingUser.coverImage.id)); // ✅ single string
      }

      const uploaded = await uploadToS3(files.coverImage[0], 'cover-images');
      userUpdateData['coverImage'] = {
        id: uploaded.id,
        url: uploaded.url,
      };
    }

    // ─── Update User ─────────────────────────────────────────
    const updatedUser = await User.findByIdAndUpdate(
      user.id,
      { $set: userUpdateData },
      { new: true, session },
    );

    if (!updatedUser) throw new Error('User not found');

    // ─── Social Link fields ──────────────────────────────────
    const socialFields = [
      'shopName',
      'shopLink',
      'facebook',
      'instagram',
      'linkedin',
      'twitter',
      'youtube',
      'tiktok',
      'website',
    ];
    const socialUpdateData: Record<string, unknown> = {};

    for (const field of socialFields) {
      if (body[field] !== undefined) {
        socialUpdateData[field] = body[field];
      }
    }

    let updatedSocial = null;
    if (Object.keys(socialUpdateData).length > 0) {
      updatedSocial = await SocialLink.findOneAndUpdate(
        { user: user.id },
        { $set: socialUpdateData },
        { new: true, upsert: true, session },
      );
    }

    await session.commitTransaction();
    return { user: updatedUser, socialLinks: updatedSocial };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const getProfile = async (user: JwtPayload) => {
  const result = await User.findById(user.id).select('+coverImage').populate({
    path: 'subscription.plan',
    select: 'name price duration features ',
  });

  if (!result) throw new Error('User not found');

  // Social links also fetch koro
  const socialLinks = await SocialLink.findOne({ user: user.id });
  const Personalizationdata = await Personalization.findOne({ user: user.id });

  return { user: result, socialLinks, Personalizationdata };
};


export const register = async (payload: any) => {
  const {
    fullName,
    email: rawEmail,
    password,
    confirmPassword,
    about,
    role,
    country,
    phoneNumber,
    howDidYouHear,
    subscribeToEmails,
    termsAccepted,
    longitude,
    latitude,
    djname,
    shopName,
    shoptype,
    facebook,
    instagram,
    linkedin,
    twitter,
    youtube,
    tiktok,
    website,
    shoplink,
    file,
  } = payload;

  const email = rawEmail ? rawEmail.trim().toLowerCase() : '';

  // ── ১. বেসিক ভ্যালিডেশন ─────────────────────────
  if (!email || !password || !fullName) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password not match');
  }

  if (password.length < 6) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password too short');
  }

  // // ── ২. ডুপ্লিকেট ইমেল চেক ────────────────
  const existingUser = await User.findOne({ email }).setOptions({
    skipFilter: true,
  });
  // if (existingUser && existingUser.isVerified) {
  //   throw new AppError(
  //     httpStatus.BAD_REQUEST,
  //     'This email is already registered in our system.',
  //   );
  // }

  // ── ③. ডুপ্লিকেট ফোন নাম্বার চেক ─────────────────────────
  // if (phoneNumber) {
  //   const existingPhone = await User.findOne({
  //     phoneNumber,
  //     isVerified: true,
  //   }).setOptions({ skipFilter: true });
  //   if (existingPhone && existingPhone.email !== email) {
  //     throw new AppError(
  //       httpStatus.BAD_REQUEST,
  //       'This phone number is already in use by another verified account.',
  //     );
  //   }
  // }


  const otpNumber = Number(generateOtp());
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // ── ৫. ইমেজ আপলোড লজিক ─────────────────────────
  let uploadedImage;
  if (file) {
    uploadedImage = await uploadToS3(file, 'user');
  }

  // ── 6. জিও লোকেশন ফরম্যাটিং ─────────────────────────
  let geoLocation;
  if (longitude && latitude) {
    geoLocation = {
      type: 'Point',
      coordinates: [parseFloat(longitude), parseFloat(latitude)],
    };
  }

  // ── ৭. পুরোনো আন-ভেরিফাইড ডাটা ক্লিন করা ─────────────────
  if (existingUser) {
    await User.deleteOne({ email }).setOptions({ skipFilter: true });
    await SocialLink.deleteOne({ user: existingUser._id });
  }


  const userObj = await User.create({
    fullName,
    email,
    password,
    djname: djname || '',
    role,
    about: about || '',
    image: uploadedImage
      ? { id: uploadedImage.id, url: uploadedImage.url }
      : undefined,
    location: geoLocation,
    country: country || undefined,
    phoneNumber: phoneNumber || undefined,
    howDidYouHear: howDidYouHear || '',
    subscribeToEmails: subscribeToEmails ?? false,
    termsAccepted,
    accountType: 'emailvarifi',
    isVerified: false,
    isActive: false,

    verification: {
      otp: otpNumber,
      expiresAt: expiresAt,
      status: false, 
    },
  });

  // ── ৯. সোশ্যাল ডাটা চ্যাকিং ও সেভ ─────────────────
  const hasSocialData =
    shopName ||
    shoptype ||
    facebook ||
    instagram ||
    linkedin ||
    twitter ||
    youtube ||
    tiktok ||
    website ||
    shoplink;

  if (hasSocialData) {
    await SocialLink.create({
      user: userObj._id,
      shopName: shopName || '',
      shoptype: shoptype || '',
      facebook: facebook || '',
      instagram: instagram || '',
      linkedin: linkedin || '',
      twitter: twitter || '',
      youtube: youtube || '',
      tiktok: tiktok || '',
      website: website || '',
      shoplink: shoplink || '',
    });
  }

  // ── ১০. ওটিপি ইমেইল পাঠানো ─────────────────────────
  await sendEmail(
    email,
    'Verify your Skatrium account',
    getOtpEmailTemplate(fullName, otpNumber),
  );

  return { email };
};

export const verifyEmailregister = async (rawEmail: string, rawOtp: string) => {
  const email = rawEmail ? rawEmail.trim().toLowerCase() : '';
  const otp = rawOtp ? String(rawOtp).trim() : '';

  console.log('পোস্টম্যান থেকে আসা ইমেল (Trimmed):', email);


  const user = await User.findOne({ email }).setOptions({ skipFilter: true });

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User not found');
  }


  const dbOtp = user.verification?.otp
    ? String(user.verification.otp).trim()
    : '';
  const dbExpiresAt = user.verification?.expiresAt;



  // ওটিপি ম্যাচিং চেক
  if (dbOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP');
  }

  // ওটিপি মেয়াদ চেক
  if (dbExpiresAt && dbExpiresAt < new Date()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'OTP has expired. Please signup again.',
    );
  }

  user.isVerified = true;
  user.isActive = true;

  if (user.verification) {
    user.verification.status = true; 
  }

  await user.save();

 
  await sendEmail(
    email,
    "Welcome to Skatrium – You're all set! 🎉",
    getWelcomeEmailTemplate(user.fullName, email),
  );

  const socialLink = await SocialLink.findOne({ user: user._id });


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
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      image: user.image,
      isVerified: true,
      socialLink: socialLink || null,
    },
    accessToken,
  };
};

// ─────────────────────────────────────────────
// 📧 ইমেইল টেমপ্লেট দুটি (হুবহু অপরিবর্তিত রাখা হলো)
// ─────────────────────────────────────────────

function getOtpEmailTemplate(fullName: string, otp: string | number): string {
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:36px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">Skatrium</h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Platform</p>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;">Verify Your Email Address</h2>
                <p style="margin:0 0 28px;color:#555;font-size:15px;line-height:1.6;">
                  Hi <strong>${fullName}</strong>, thanks for signing up! Use the code below to verify your email address.
                </p>
                <div style="background:#f0efff;border:2px dashed #4F46E5;border-radius:10px;padding:24px;text-align:center;margin-bottom:28px;">
                  <p style="margin:0 0 8px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Your Verification Code</p>
                  <h1 style="margin:0;font-size:42px;letter-spacing:14px;color:#4F46E5;font-weight:800;">${otp}</h1>
                </div>
                <p style="margin:0 0 8px;color:#888;font-size:13px;text-align:center;">⏳ This code will expire in <strong>10 minutes</strong>.</p>
                <p style="margin:0;color:#888;font-size:13px;text-align:center;">Do not share this code with anyone.</p>
              </td>
            </tr>
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
  `;
}

function getWelcomeEmailTemplate(fullName: string, email: string): string {
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:36px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">Skatrium</h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Platform</p>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;">🎉 Registration Successful!</h2>
                <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
                  Hi <strong>${fullName}</strong>, your Skatrium account has been successfully created and verified. You're now ready to get started!
                </p>
                <div style="background:#f0efff;border-left:4px solid #4F46E5;border-radius:6px;padding:16px 20px;margin-bottom:28px;">
                  <p style="margin:0 0 6px;color:#333;font-size:14px;"><strong>📧 Email:</strong> ${email}</p>
                  <p style="margin:0;color:#333;font-size:14px;"><strong>✅ Status:</strong> Verified</p>
                </div>
                <p style="margin:0 0 28px;color:#555;font-size:14px;line-height:1.6;">
                  You can now log in to your account and explore everything Skatrium has to offer.
                </p>
                <div style="text-align:center;">
               
              </td>
            </tr>
            <tr>
              <td style="background:#f9f9f9;padding:24px 40px;border-top:1px solid #eee;text-align:center;">
                <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
                  If you did not create this account, contact us at support@skatrium.com<br/>
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
  `;
}


export const resendOtpService = async (rawEmail: string) => {
  const email = rawEmail ? rawEmail.trim().toLowerCase() : '';

  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is required');
  }

  // ── ১. ইউজার খোঁজা ─────────────────────────
  const user = await User.findOne({ email }).setOptions({ skipFilter: true });

  if (!user) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No registration found for this email. Please register again.',
    );
  }

  if (user.isVerified) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This email is already verified. Please log in.',
    );
  }

  // ── ২. স্প্যাম প্রতিরোধ (optional) ─────────────────────────
  // পুরোনো OTP এখনো ৪ মিনিটের কম পুরোনো হলে রিসেন্ড ব্লক করবে (৫ মিনিট মেয়াদের মধ্যে)
  const oldExpiresAt = user.verification?.expiresAt;
  if (oldExpiresAt) {
    const remainingMs = oldExpiresAt.getTime() - Date.now();
    const totalMs = 5 * 60 * 1000;
    if (remainingMs > totalMs - 60 * 1000) {
      throw new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        'Please wait a moment before requesting a new code',
      );
    }
  }

  // ── ৩. নতুন OTP জেনারেট ও সেভ ─────────────────────────
  const otpNumber = Number(generateOtp());
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  user.verification = {
    otp: otpNumber,
    expiresAt: expiresAt,
    status: false,
  };

  await user.save();

  // ── ৪. ইমেইল পাঠানো ─────────────────────────
  await sendEmail(
    email,
    'Your new Skatrium verification code',
    getOtpEmailTemplate(user.fullName, otpNumber),
  );

  return { email };
};


export const sosalServices = {
  register,
  updateProfile,
  getProfile,
};
