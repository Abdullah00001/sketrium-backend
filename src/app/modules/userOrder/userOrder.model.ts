// order.model.ts
import { model, Schema } from 'mongoose';
import { IOrder } from './userOrder.interface';
import { string } from 'zod';

const orderItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  color: { type: String, default: '' },
  size: { type: String, default: '' },
  price: { type: Number, required: true }, // snapshot at time of order
});

const orderSchema = new Schema<IOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    shippingAddress: {
      fullName: { type: String }, //required: true
      phone: { type: String, default: '' },
      apartment: { type: String, default: '' },
      address: { type: String }, // required: true },
      city: { type: String }, //required: true
      country: { type: String }, // required: true },
      state: { type: String, default: '' },
      postcode: { type: String, default: '' },
    },

    oderid: { type: String },

    subtotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },

    orderStatus: {
      type: String,
      enum: ['processing', 'shipped', 'delivered', 'cancelled'],
      default: 'processing',
    },
    stripePaymentIntentId: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.pre('find', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

orderSchema.pre('findOne', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

export const Order = model<IOrder>('Order', orderSchema);
