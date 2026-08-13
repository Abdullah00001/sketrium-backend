import { model, Schema } from "mongoose";
import { ISettings } from "./Settings.interface";


const settingsSchema = new Schema<ISettings>(
  {
    type: {
      type: String,
      enum: ["privacy_policy", "terms_conditions", "about_us", "mission_statement", "disclaimer", "community_guidelines"],
      required: true,
    },
    content: {
     type: String,
    required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true, versionKey: false }
);

settingsSchema.index({ type: 1 }, { unique: true });

export const Settings = model<ISettings>("Settings", settingsSchema);