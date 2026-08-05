import { model, Schema } from "mongoose";
import { IProductReviewReport } from "./Productreviewreport.interface";


const ProductReviewReportSchema = new Schema<IProductReviewReport>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    review: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
     required: true,
    },
    status: {
      type: String,
      enum: ["pending", "resolved", "dismissed"],
      default: "pending",
    },
  },
  { timestamps: true, versionKey: false }
);

export const ProductReviewReport = model<IProductReviewReport>(
  "ProductReviewReport",
  ProductReviewReportSchema
);