/* eslint-disable @typescript-eslint/no-explicit-any */
import * as appleSignin from 'apple-signin-auth';
export type QueryObject = {
  [key: string]: any;
};

export type Tlogin = {
  email?: string;
  countryCode?: string;
  phoneNumber?: string;
  password: string;
  fcmToken: string;
};
export type TchangePassword = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};
export type TresetPassword = {
  newPassword: string;
  confirmPassword: string;
};


export type TRegister = {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
  countryCode: string;
  gender: 'Male' | 'Female';
}

// Extend Apple payload type to include optional name
 export interface ApplePayload extends appleSignin.AppleIdTokenType {
  name?: {
    firstName?: string;
    lastName?: string;
  };
}


export interface VerifyOtpPayload {
  email: string;
  otp: number;
}
