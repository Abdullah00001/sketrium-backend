import { Types } from "mongoose";

// export type TProductReportReason =
//   | "Spam"
//   | "Inappropriate content"
//   | "Fake review"
//   | "Hate speech"
//   | "Other";

export type TProductReportStatus = "pending" | "resolved" | "dismissed";

export interface IProductReviewReport {
  _id?: Types.ObjectId;
  product: Types.ObjectId;
  review: Types.ObjectId;
  reportedBy: Types.ObjectId;
  reason: String;
  status: TProductReportStatus;
  createdAt?: Date;
  updatedAt?: Date;
}