import { Schema, model } from 'mongoose';
import { IReservationRecord } from './reservationRecord.interface';

const reservationRecordSchema = new Schema<IReservationRecord>(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'MarketplacePayment',
      required: true,
    },
    reservationType: {
      type: String,
      enum: ['PRODUCT', 'EVENT'],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['RESERVED', 'CONFIRMED', 'RELEASED'],
      default: 'RESERVED',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

reservationRecordSchema.index({ paymentId: 1 });
reservationRecordSchema.index({ targetId: 1, reservationType: 1 });
reservationRecordSchema.index({ status: 1, expiresAt: 1 });

export const ReservationRecord = model<IReservationRecord>(
  'ReservationRecord',
  reservationRecordSchema
);
