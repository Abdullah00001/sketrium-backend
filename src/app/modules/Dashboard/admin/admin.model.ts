import { Schema, model } from 'mongoose';

import bcrypt from 'bcrypt';
import config from '../../../config/index';
import { AdminModel, TAdminDoc } from './admin.interface';


const AdminSchema = new Schema<TAdminDoc>(
  {
    fullName: { type: String },
    phoneNumber: { type: String },

    email: { type: String, required: true, unique: true },
    image: {
      id: String,
      url: String,
    },

    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'super_admin'], required: true },
    isActive: { type: Boolean, default: true },
    verification: {
      otp: Number,
      expiresAt: Date,
      verified: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  },
);

AdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(
    this.password,
    Number(config.bcrypt_salt_rounds),
  );
  next();
});

AdminSchema.methods.isPasswordMatched = async function (
  enteredPassword: string,
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

AdminSchema.statics.isAdminExist = function (email: string) {
  return this.findOne({ email }).select('+password');
};

export const Admin = model<TAdminDoc, AdminModel>('Admin', AdminSchema);
