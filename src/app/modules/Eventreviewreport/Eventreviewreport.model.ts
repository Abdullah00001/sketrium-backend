import { model, Schema } from "mongoose";
 
const EventReviewReportSchema = new Schema(
  {
    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    review: {
      type: Schema.Types.ObjectId, // Event.reviews এর sub-document id
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
 
export const EventReviewReport = model("EventReviewReport", EventReviewReportSchema);
 