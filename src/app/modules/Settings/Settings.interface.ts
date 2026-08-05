import { Types } from "mongoose";

export type TSettingsRole = "MARCHANT" | "KAATEDJ" | "ORGANIZER" | "USER";
export type TSettingsType = "privacy_policy" | "terms_conditions" | "about_us" | "mission_statement";

export interface ISettings {
  _id?: Types.ObjectId;
  role: TSettingsRole;
  type: TSettingsType;
  content: string;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}