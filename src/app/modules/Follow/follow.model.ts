import { model, Schema } from "mongoose";
import { IFollow } from "./follow.interface";

const followSchema = new Schema<IFollow>(
  {
    follower: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    following: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);


followSchema.index({ follower: 1, following: 1 }, { unique: true });

export const Follow = model<IFollow>("Follow", followSchema);