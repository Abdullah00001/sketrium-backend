/* eslint-disable @typescript-eslint/no-explicit-any */
import { Model } from 'mongoose';
export enum UserRole {
  USER = 'USER',
  admin = 'admin',
  MARCHANT = 'MARCHANT',
  KAATEDJ = 'KAATEDJ',
  ORGANIZER = 'ORGANIZER',
}
export enum status {
  pending = 'pending',
  active = 'active',
  blocked = 'blocked',
}

// export enum Gender {
//   Male = 'Male',
//   Female = 'Female',
// }
interface Verification {
  otp: string | number;
  expiresAt: Date;
  status: boolean;
}
interface image {
  id: string | number;
  url: string;
}

export interface ILocation {
  type: 'Point';
  coordinates: [longitude: number, latitude: number]; // [lng, lat]
}

export interface TUser {
  [x: string]: any;
  id?: string;
  email: string;
  password: string;
  name: string;
  phoneNumber: string;
  website: string;
  categore: string;
  image: image;
  needsPasswordChange: boolean;
  passwordChangedAt?: Date;
  role: UserRole;
  status?: status;
  isVerified: boolean;
  isActive: boolean;
  isDeleted: boolean;
  verification: Verification;
  language: string;
  coverImage?: {
    // 👈 এটা add koro
    id: string;
    url: string;
  };
  djname?: string;
  accountType?: 'emailvarifi' | 'google' | 'facebook' | 'linkedin' | 'apple';
  country: string;
  fcmToken?: string;
  adminapproval?: 'pending' | 'approved' | 'rejected';
  howDidYouHear?: string;
  subscribeToEmails?: boolean;
  termsAccepted?: boolean;
  location?: ILocation;
  isPremium?: boolean;
  subscription?: {
    startsAt?: Date;
    expiresAt?: Date;
    status?: 'active' | 'trialing' | 'expired' | 'cancelled' | 'none';
    revenueCatPackageName?: string;
    revenueCatEntitlementId?: string;
    revenueCatOriginalAppUserId?: string;
  };
}

export interface UserModel extends Model<TUser> {
  isUserExist(email: string): Promise<TUser>;
  isUserExistByNumber(countryCode: string, phoneNumber: string): Promise<TUser>;
  IsUserExistbyId(id: string): Promise<TUser>;
  isPasswordMatched(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean>;
}
