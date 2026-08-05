import { Types } from "mongoose";

export type TNotificationTargetRole = "USER" | "MARCHANT" | "ORGANIZER" | "ALL";

export interface INotification {
  _id?: Types.ObjectId;
  title: string;
  description: string;
  targetRole: TNotificationTargetRole;
  sentBy: Types.ObjectId;
  sentCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}