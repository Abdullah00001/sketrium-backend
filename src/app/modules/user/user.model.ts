/* eslint-disable @typescript-eslint/no-this-alias */
import bcrypt from 'bcrypt';
import { model, Schema } from 'mongoose';
import config from '../../config';

import { Types } from 'mongoose';
import { TUser, UserModel, UserRole } from './user.interface';
import { de } from 'zod/v4/locales';

// Define the schema for Verification
const VerificationSchema = new Schema({
  otp: {
    type: Number, // Allows string or number
    required: true,
  },
  expiresAt: {
    type: Date,
    // required: true,
  },

  status: {
    type: Boolean,
    required: true,
  },
});
const imageSchema = new Schema({
  id: {
    type: String, // Allows string or number
    required: true,
  },
  url: {
    type: String,
    default: "",
    required: true,
  },
default: {},
});
// Define the schema for the User model
const UserSchema = new Schema<TUser, UserModel>(
  {
    email: {
      type: String,
    //   unique: true,
     required: true,
  
    },
    image: imageSchema,
    fullName: {
      type: String,
      required: true,
  
    },
    password: {
      type: String,
      select: false,

    },
    country: {
      type: String,
      // required: function(this: TUser) { return this.isVerified === true; },
      sparse: true, // 🔥 important
      // import admin from './../Dashboard/notifications/Firebase ';

    },

    phoneNumber: {
      type: String,
    
    },
    needsPasswordChange: {
      type: Boolean,
      default: false,
    },
    passwordChangedAt: {
      type: Date,
    },
    
    about: {
      type: String,
      default: "",
    },

    accountType: {
      type: String,
      enum: ['emailvarifi', 'google', 'facebook', 'linkedin', 'apple'],
      default: 'emailvarifi',
    },
 
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
      // default: UserRole.agencies,  
    },
        howDidYouHear: {
        type: String,
        default: "",
      },

      subscribeToEmails: {
        type: Boolean,
        default: false,
      },

      termsAccepted: {
        type: Boolean,
        default: false,
      },
      djname: { type: String, default: "" },
      
      adminapproval: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
      },
      isPremium: {
        type: Boolean,
        default: false,
      },

    // subscription: {
    //   plan: {
    //     type: Schema.Types.ObjectId,
    //     ref: 'Subscription',
    //   },
    //   startsAt: Date,
    //   expiresAt: Date,
    //   status: {
    //     type: String,
    //      enum: ['active', 'expired', 'cancelled', 'none'],
    //      default: 'none',
    //   },
    // },
   

  subscription: {
    startsAt: Date,
    expiresAt: Date,
    status: {
      type: String,
      enum: ['active', 'trialing', 'expired', 'cancelled', 'none'],
      default: 'none',
    },
    revenueCatPackageName: { type: String },
    revenueCatEntitlementId: { type: String },
    revenueCatOriginalAppUserId: { type: String },
  },


   coverImage: {       
      type: imageSchema,
      // required: false,
      default:null, // 👈 এটা add koro
    },


   fcmToken: { type: String, default: "" },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    verification: {
      type: VerificationSchema,
      required: false,
    },
 

      location: {
         type: {
           type: String,
          enum: ['Point'],
        // default: 'Point'
         },
         coordinates: {
          type: [Number],
        
        },
      },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  },
);



//👉 Password change না হলে hash করবে না

// UserSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();
//   this.password = await bcrypt.hash(
//     this.password as string,
//     Number(config.bcrypt_salt_rounds),
//   );
//   next();
// });

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(
    this.password,
    Number(config.bcrypt_salt_rounds)
  );

  next();
});
// set '' after saving password
// UserSchema.post('save', function (doc, next) {
//   doc.password = '';
//   next();
// });

// Check if a user exists by email
UserSchema.statics.isUserExist = async function (
  email: string,
): Promise<TUser | null> {
  return this.findOne({ email }).select('+password');
};

// Check if a user exists by phone number
UserSchema.statics.isUserExistByNumber = async function (
  countryCode: string,
  phoneNumber: string,
) {
  return this.findOne({ countryCode, phoneNumber }).select('+password');
};


UserSchema.statics.IsUserExistbyId = async function (
  id: string,
): Promise<Pick<TUser, '_id' | 'email' | 'role' | 'password'> | null> {
  return this.findOne({
    _id: new Types.ObjectId(id),
    isDeleted: { $ne: true },
  }).select('+password');
};

// Compare plain text password with hashed password
UserSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, hashedPassword);
};

// filter out deleted documents
UserSchema.pre('find', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

UserSchema.pre('findOne', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

UserSchema.pre('aggregate', function (next) {
  this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
  next();
});
// Create and export the User model
const User = model<TUser, UserModel>('User', UserSchema);

export default User;
