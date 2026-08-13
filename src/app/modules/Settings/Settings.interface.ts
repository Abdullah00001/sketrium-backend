import { Types } from "mongoose";

export type TSettingsType = "privacy_policy" | "terms_conditions" | "about_us" | "mission_statement" | "disclaimer" | "community_guidelines";

export interface ISettings {
  _id?: Types.ObjectId;
  type: TSettingsType;
  content: string;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}