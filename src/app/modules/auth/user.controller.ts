import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';
import catchAsync from '../../utils/catchAsync';
import { Request, Response } from 'express';
import User from '../user/user.model';
import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import jwt, { JwtPayload, Secret } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import config from '../../config';
import sendResponse from '../../utils/sendResponse';
import {
  authServices,
  register,
  resendOtpregister,
  userResetPasswordService,
  verifyEmailregister,
} from './user.service';
import { UserRole } from '../user/user.interface';
// import { AuthServices } from './user.service';
import * as appleSignin from 'apple-signin-auth';
import { ApplePayload } from './user.interface';
import admin from '../Dashboard/notifications/Firebase';
import { USER_ROLE } from '../user/user.constant';
import { Personalization } from '../Personalizationuser/Personalization.model';
import SocialLink from '../sociallink/soscial.model';

const googleClient = new OAuth2Client(
  '23601987612-ko94q8ki1ui42igekam6f87kamceuvu4.apps.googleusercontent.com',
);

const userRegistration = catchAsync(async (req: Request, res: Response) => {
  const result = await register(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'User registered successfully',
    data: result,
  });
});

const verifyEmailController = catchAsync(
  async (req: Request, res: Response) => {
    const { email, code } = req.body;
    const result = await verifyEmailregister(email, code);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Email verified successfully',
      data: result,
    });
  },
);

const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password, fcmToken } = req.body;
  const user = await User.findOne({ email, isActive: true }).select(
    '+password',
  );

  if (!user || !user?.password) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);
  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Incorrect password');
  }

  if (fcmToken) {
    user.fcmToken = fcmToken;
    await user.save({ validateBeforeSave: false });
  }

  //   if (user.role === 'ORGANIZER') {
  //   if (user.adminApproval !== 'approved') {
  //     throw new AppError(
  //       httpStatus.FORBIDDEN,
  //       user.adminApproval === 'pending'
  //         ? 'Your account is pending admin approval. Please wait.'
  //         : 'Your account has been rejected. Please contact support.',
  //     );
  //   }
  // }

  const accessToken = jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    config.jwt.jwt_access_secret as Secret,
    { expiresIn: '30d' },
  );

  const refreshToken = jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    config.jwt.jwt_refresh_secret as Secret,
    { expiresIn: '30d' },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Login successful',
    data: {
      user,
      accessToken,
      refreshToken,
    },
  });
});

// const login

const ornagizerlogin = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body; //adminapproval: 'approved'
  const user = await User.findOne({ email, isActive: true }).select(
    '+password',
  );

  if (!user || !user?.password) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);
  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Incorrect password');
  }

  //  // Admin approval check
  // if (user.adminApproval !== 'approved') {

  //   throw new AppError(
  //     httpStatus.FORBIDDEN,
  //     'Admin has not approved your account yet'
  //   );
  // }

  const accessToken = jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    config.jwt.jwt_access_secret as Secret,
    { expiresIn: '24h' },
  );

  const refreshToken = jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    config.jwt.jwt_refresh_secret as Secret,
    { expiresIn: '7d' },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Login successful',
    data: {
      user,
      accessToken,
      refreshToken,
    },
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers.token as string;
  const { newPassword } = req.body;

  if (!token) throw new AppError(httpStatus.UNAUTHORIZED, 'Token missing');

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(
      token,
      config.jwt.jwt_access_secret as Secret,
    ) as JwtPayload;
  } catch {
    throw new AppError(httpStatus.FORBIDDEN, 'Token expired or invalid');
  }

  if (!decoded?.id || !decoded?.allowReset) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'OTP not verified or reset not allowed',
    );
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  user.password = newPassword; // raw password
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password reset successfully',
    data: { user },
  });
});

// 3. Change Password - for logged-in users
const changePassword = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch)
    throw new AppError(httpStatus.BAD_REQUEST, 'Old password is incorrect');

  // const hashedPassword = await bcrypt.hash(newPassword, 12);
  // user.password = hashedPassword;
  // await user.save();
  user.password = newPassword; // raw password
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password changed successfully',
    data: { user },
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Refresh token is required');
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      config.jwt.jwt_refresh_secret as Secret,
    ) as JwtPayload;
    const token = jwt.sign(
      { id: decoded.id, role: decoded.role },
      config.jwt.jwt_access_secret as Secret,
      { expiresIn: '24h' },
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Access token refreshed',
      data: { token },
    });
  } catch {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Invalid or expired refresh token',
    );
  }
});

export const facebookLogin = catchAsync(async (req: Request, res: Response) => {
  const { accessToken, role, fcmToken } = req.body;
  if (!accessToken) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Facebook accessToken is required',
    );
  }
  if (!role) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Role is required');
  }
  // 🔹 Get user info from Facebook
  const fbRes = await axios.get('https://graph.facebook.com/me', {
    params: {
      fields: 'id,name,email',
      access_token: accessToken,
    },
  });
  console.log('FB DATA:', fbRes.data);
  const { id, name, email } = fbRes.data;
  // 🔹 Fallback email (VERY IMPORTANT)
  const finalEmail = email || `${id}@facebook.com`;
  // 🔹 Find or create user
  let user = await User.findOne({ email: finalEmail });
  if (!user) {
    user = await User.create({
      email: finalEmail,
      role: role,
      fullName: name,
      accountType: 'facebook',
      isVerified: true,
      fcmToken: fcmToken || '',
      image: {
        id: 'facebook',
        url:
          fbRes.data.picture?.data?.url ||
          'https://i.ibb.co/z5YHLV9/profile.png',
      },
    });
  } else if (fcmToken) {
    user.fcmToken = fcmToken;
    await user.save({ validateBeforeSave: false });
  }
  // 🔹 Generate JWT tokens
  const accessTokenJwt = jwt.sign(
    { id: user._id, role: user.role },
    config.jwt.jwt_access_secret as Secret,
    { expiresIn: '24h' },
  );
  const refreshToken = jwt.sign(
    { id: user._id, role: user.role },
    config.jwt.jwt_refresh_secret as Secret,
    { expiresIn: '7d' },
  );
  // 🔹 Send response
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Facebook login successful',
    data: {
      user,
      accessToken: accessTokenJwt,
      refreshToken,
    },
  });
});

const linkedInLogin = catchAsync(async (req: Request, res: Response) => {
  const { accessToken, role } = req.body;

  if (!accessToken) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'LinkedIn accessToken is required',
    );
  }

  if (!role) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Role is required');
  }

  try {
    const profileRes = await axios.get('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const emailRes = await axios.get(
      'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const email = emailRes.data.elements[0]['handle~'].emailAddress;
    const name = `${profileRes.data.localizedFirstName} ${profileRes.data.localizedLastName}`;

    if (!email) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Unable to get email from LinkedIn',
      );
    }

    // 3. Find or create user
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        fullName: name,
        isVerified: true,
        accountType: 'linkedin', // important
        role: role,
        image: {
          id: 'linkedin', // any default id
          url: 'https://i.ibb.co/z5YHLV9/profile.png', // LinkedIn থেকে profile picture পাওয়া একটু tricky, তাই default দিলাম
        },
      });
    }

    // 4. Generate tokens
    const accessTokenJwt = jwt.sign(
      { id: user._id, role: user.role },
      config.jwt.jwt_access_secret as Secret,
      { expiresIn: '24h' },
    );

    const refreshToken = jwt.sign(
      { id: user._id, role: user.role },
      config.jwt.jwt_refresh_secret as Secret,
      { expiresIn: '7d' },
    );

    // 5. Send response
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'LinkedIn login successful',
      data: { user, accessToken: accessTokenJwt, refreshToken },
    });
  } catch (err) {
    console.error(err);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'LinkedIn login failed',
    );
  }
});

export const appleLogin = catchAsync(async (req: Request, res: Response) => {
  const { identityToken, role } = req.body;

  if (!identityToken) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Apple identity token is required',
    );
  }

  if (!role) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Role is required');
  }

  // 🔹 Verify the Apple JWT
  let applePayload: ApplePayload;
  try {
    applePayload = (await appleSignin.verifyIdToken(identityToken, {
      audience: config.apple.client_id, // Bundle ID (iOS) or Service ID (Web)
      ignoreExpiration: false,
    })) as ApplePayload;
  } catch (err) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid Apple identity token');
  }

  console.log('Apple payload:', applePayload);

  const { sub: appleId, email, name } = applePayload;

  const finalEmail = email || `${appleId}@apple.com`;

  let user = await User.findOne({ email: finalEmail });

  if (!user) {
    const fullName = name?.firstName
      ? `${name.firstName} ${name.lastName || ''}`
      : 'Apple User';

    user = await User.create({
      email: finalEmail,
      role: role,
      fullName,
      accountType: 'apple',
      isVerified: true,
      image: {
        id: 'apple',
        url: 'https://i.ibb.co/z5YHLV9/profile.png',
      },
    });
  }

  const accessTokenJwt = jwt.sign(
    { id: user._id, role: user.role },
    config.jwt.jwt_access_secret as Secret,
    { expiresIn: '24h' },
  );

  const refreshToken = jwt.sign(
    { id: user._id, role: user.role },
    config.jwt.jwt_refresh_secret as Secret,
    { expiresIn: '7d' },
  );

  // 🔹 Send response
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Apple login successful',
    data: {
      user,
      accessToken: accessTokenJwt,
      refreshToken,
    },
  });
});

const codeVerification = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is required');
  }

  const otp = await authServices.sendVerificationCode(email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP sent successfully, please verify before reset password',
    data: { email, otp },
  });
});

export const verifyOtpController = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email and OTP are required');
  }

  await authServices.userVerifyOtp(email, Number(otp));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP verified successfully. You can now reset your password.',
    data: { email },
  });
});

export const userResetPassword = catchAsync(
  async (req: Request, res: Response) => {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email || !newPassword || !confirmPassword) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Email, newPassword and confirmPassword are required',
      );
    }

    if (newPassword !== confirmPassword) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Passwords do not match');
    }

    await userResetPasswordService(email, newPassword);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Password reset successful',
      data: {},
    });
  },
);

const sendOtp = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new AppError(400, 'Email is required');

  await authServices.Enteryouremail(email);

  res.status(200).json({
    success: true,
    message: 'OTP sent successfully to your email',
  });
});

const verifyOtpOnly = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) throw new AppError(400, 'Email and OTP are required');

  // Verify OTP
  await authServices.verifyOtp(email, Number(otp));

  res.status(200).json({
    success: true,
    message: 'OTP verified successfully',
  });
});

const googleLogin = catchAsync(async (req: Request, res: Response) => {
  const { idToken, role, fcmToken } = req.body;

  if (!idToken) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Firebase ID Token required');
  }
  if (!role) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Role required');
  }
  if (!Object.values(USER_ROLE).includes(role)) {
    console.log('Invalid role received:', role);
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid role');
  }
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid or expired token');
  }
  const email = decodedToken.email;
  const fullName = decodedToken.name;
  const picture = decodedToken.picture;

  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email not found');
  }
  let user = await User.findOne({ email });

  if (user && (!user.isActive || user.isDeleted)) {
    throw new AppError(httpStatus.FORBIDDEN, 'Your account is not active');
  }
  let isNewUser = false;
  if (!user) {
    try {
      user = await User.create({
        email,
        role,
        fullName: fullName || 'Google User',
        isVerified: true,
        accountType: 'google',
        fcmToken: fcmToken || '',
        image: {
          id: 'google',
          url: picture || 'https://i.ibb.co/z5YHLV9/profile.png',
        },
      });
      isNewUser = true;
    } catch (err) {
      throw err;
    }
  } else if (fcmToken) {
    user.fcmToken = fcmToken;
    await user.save({ validateBeforeSave: false });
  }

  if (isNewUser) {
    try {
      await Personalization.create({ user: user._id });
      await SocialLink.create({ user: user._id });
    } catch (err) {
      console.error('Personalization.create failed:', err);
      console.error('SocialLink.create failed:', err);
    }
  }

  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    config.jwt.jwt_access_secret as Secret,
    { expiresIn: '30d' },
  );
  const refreshToken = jwt.sign(
    { id: user._id, role: user.role },
    config.jwt.jwt_refresh_secret as Secret,
    { expiresIn: '30d' },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google login successful',
    data: {
      user,
      accessToken,
      refreshToken,
    },
  });
});

const resendOtpController = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is required');
  }

  const result = await resendOtpregister(email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP resent successfully',
    data: result,
  });
});
export const authControllers = {
  userRegistration,
  login,
  sendOtp,
  verifyOtpOnly,
  resetPassword,
  verifyOtpController,
  codeVerification,
  changePassword,
  refreshToken,
  linkedInLogin,
  googleLogin,
  facebookLogin,
  ornagizerlogin,
  appleLogin,
  verifyEmailController,
  resendOtpController,
};
