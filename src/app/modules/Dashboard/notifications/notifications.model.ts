import { model, Schema } from "mongoose";
import { INotification } from "./notifications.interface";

const notificationSchema = new Schema<INotification>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    targetRole: {
      type: String,
      enum: ["USER", "MARCHANT", "ORGANIZER", "ALL"],
      required: true,
    },
    sentBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    sentCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

export const Notification = model<INotification>("Notification", notificationSchema);