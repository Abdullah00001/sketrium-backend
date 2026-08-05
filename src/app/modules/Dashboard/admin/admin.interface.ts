import { Document, Model } from 'mongoose';

export type TAdmin = {
  fullName?: string;
  phoneNumber?: string;
  email: string;
  password: string;
  image?: {
    id: string;
    url: string;
  };

  role: 'admin' | 'super_admin';
  isActive?: boolean;
  verification?: {
    otp: number;
    expiresAt: Date;
    verified: boolean;
  };
};

export interface TAdminDoc extends TAdmin, Document {
  isPasswordMatched(password: string): Promise<boolean>;
}

export interface AdminModel extends Model<TAdminDoc> {
  isAdminExist(email: string): Promise<TAdminDoc | null>;
}
