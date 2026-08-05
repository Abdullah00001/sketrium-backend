// product.model.ts
import { model, Schema } from "mongoose";
import { IProduct, IReview, IReviewReply } from "./product.interface";



// ✅ নতুন replySchema add করো reviewSchema এর উপরে
const replySchema = new Schema<IReviewReply>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    comment: { type: String, required: true },
  },
  { timestamps: true }
);


const reviewSchema = new Schema<IReview>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true },
     images: [
      {
        id: { type: String, default: "" },
        url: { type: String, default: "" },
      },
    ],
      isAnonymous: {
      type: Boolean,
      default: false,
    },
    replies: [replySchema],
  },
  { timestamps: true }
);

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'ProductCategory',
      required: true,
    },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },

    shippingCost: { type: Number, default: 0 },
    colors: [{ type: String }],
    sizes: [{ type: String }],
    images: [
      {
        id: { type: String },
        url: { type: String },
      },
    ],
    currency: {
      type: String,
      default: 'USD',
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    material: { type: String, default: '' },

    discountPrice: {
      type: Number,
      default: 0,
    },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviews: [reviewSchema],
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// productSchema.pre("find", function (next) {
//   this.find({ isDeleted: { $ne: true } });
//   next();
// });

productSchema.pre("findOne", function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

// ✅ এটা দাও
productSchema.pre(/^find/, function (next) {
  (this as any).find({ isDeleted: { $ne: true } });
  next();
});

export const Product = model<IProduct>("Product", productSchema);