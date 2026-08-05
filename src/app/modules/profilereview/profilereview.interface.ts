


// profilereview.interface.ts
import { Types } from 'mongoose';

export interface IReply {
  organizer: Types.ObjectId;
  comment: string;
  isRead: boolean;       // ✅ নতুন
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IReview {
  _id?: Types.ObjectId;
  organizer: Types.ObjectId;
  reviewer: Types.ObjectId;
  rating: number;
  comment: string;
  image?: { id: string; url: string } | null;
  isAnonymous: boolean;
  isDeleted: boolean;
  reply?: IReply | null;  // ✅ IReply type use করো
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IReport {
  _id?: Types.ObjectId;
  review: Types.ObjectId;
  reportedBy: Types.ObjectId;
  reason: string;
  status: 'pending' | 'resolved';
  createdAt?: Date;
  updatedAt?: Date;
}