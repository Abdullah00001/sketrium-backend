import { Types } from "mongoose";


export type TReportStatus = "pending" | "resolved" | "dismissed";

export interface IEventReviewReport {
  _id?: Types.ObjectId;
  event: Types.ObjectId;
  review: Types.ObjectId;
  reportedBy: Types.ObjectId;
  reason: string;
  status: TReportStatus;
  createdAt?: Date;
  updatedAt?: Date;
}