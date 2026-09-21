import { Document, Types } from 'mongoose';

export type ReservationType = 'PRODUCT' | 'EVENT';
export type ReservationStatus = 'RESERVED' | 'CONFIRMED' | 'RELEASED';

export interface IReservationRecord extends Document {
  _id: Types.ObjectId;
  paymentId: Types.ObjectId;
  reservationType: ReservationType;
  targetId: Types.ObjectId;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  confirmedAt?: Date | null;
  releasedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
