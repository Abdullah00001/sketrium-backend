import { Types } from 'mongoose';

export interface IReviewImage {
  id: string;
  url: string;
}

// ✅ Reply Interface
export interface IReply {
  _id?: Types.ObjectId;
  user: Types.ObjectId;
  comment: string;
  isRead: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ✅ Review Interface
export interface IReview {
  _id?: Types.ObjectId;
  user: Types.ObjectId;
  rating: number;
  comment: string;
  images?: IReviewImage[];
  isAnonymous?: boolean;
  replies?: IReply[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ✅ Location Interface
export interface ILocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

// ✅ নতুন — Day Schedule Interface (মডেলের dayScheduleSchema অনুযায়ী)
export interface IDaySchedule {
  date: Date;
  startTime: string;
  endTime?: string;
}

interface IAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateOrProvince: string;
  postcode: string;
  country: string;
}

// ✅ Main Event Interface
export interface IEvent {
  _id?: Types.ObjectId;
  title: string;
  category: Types.ObjectId; // মডেল অনুযায়ী required রাখা হয়েছে

  daySchedules?: IDaySchedule[]; // ✅ মডেলের daySchedules অ্যারে অনুযায়ী যোগ করা হলো

  date: Date; // Start Date হিসেবে যা মডেলে আছে
  time?: string;
  endDate: Date; // ✅ মাল্টি-ডে ইভেন্টের জন্য End Date
  address: IAddress;
  location?: ILocation;
  description?: string;
  price?: number;
  currency?: string; // ✅ গ্লোবাল অ্যাপের কারেন্সি ফিল্ড

  coverImage?: { id: string; url: string };
  gallery?: { id: string; url: string }[];
  host: Types.ObjectId;
  attendees?: Types.ObjectId[];
  reviews?: IReview[];
  isPast?: boolean;
  isDeleted?: boolean;

  skiteeventType?: string; // ⚠️ মডেলের বানান অনুযায়ী (skiteeventType) রাখা হলো

  // ── Visibility Options ────────────────────────────────────
  isHighlighted?: boolean;
  isPinned?: boolean;
  isFeatured?: boolean;
  isTopEvent?: boolean;

  // ── Event Type ────────────────────────────────────────────
  eventType?: 'Free Event' | 'Paid Event';

  createdAt?: Date;
  updatedAt?: Date;
}
