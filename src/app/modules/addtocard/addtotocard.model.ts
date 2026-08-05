import { model, Schema } from 'mongoose';
import { ICart, ICartItem } from './addtocard.inerface';

const cartItemSchema = new Schema<ICartItem>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
  },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  color: { type: String, default: '' },
  size: { type: String, default: '' },
});

const cartSchema = new Schema<ICart>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
  },
  { timestamps: true, versionKey: false },
);

export const Cart = model<ICart>('Cart', cartSchema);
