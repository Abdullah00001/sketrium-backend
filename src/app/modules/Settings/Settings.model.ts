import { model, Schema } from "mongoose";
import { ISettings } from "./Settings.interface";


const settingsSchema = new Schema<ISettings>(
  {
    role: {
      type: String,
      enum: ["MARCHANT", "KAATEDJ", "ORGANIZER","USER"],
      required: true,
    },
    type: {
      type: String,
      enum: ["privacy_policy", "terms_conditions", "about_us", "mission_statement"],
      required: true,
    },
    // content: {
    //   type: String,
    //   default: "",
    // },

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

settingsSchema.index({ role: 1, type: 1 }, { unique: true });

export const Settings = model<ISettings>("Settings", settingsSchema);