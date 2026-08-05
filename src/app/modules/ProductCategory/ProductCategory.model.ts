// productCategory.model.ts
import { model, Schema } from "mongoose";

export interface IProductCategory {
  name: string;
  isActive: boolean;
  isDeleted: boolean;
}

const productCategorySchema = new Schema<IProductCategory>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

// pre-find এবং pre-findOne হুক দুটি এভাবে আপডেট করুন:

productCategorySchema.pre("find", function (next) {
  // যদি কুয়েরি অপশনে getDeleted: true থাকে, তবে ফিল্টার অ্যাড হবে না
  if (this.getOptions().getDeleted) return next();
  
  this.find({ isDeleted: { $ne: true } });
  next();
});

productCategorySchema.pre("findOne", function (next) {
  if (this.getOptions().getDeleted) return next();
  
  this.find({ isDeleted: { $ne: true } });
  next();
});
export const ProductCategory = model<IProductCategory>(
  "ProductCategory",
  productCategorySchema
);