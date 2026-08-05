// cart.model.ts
import { model, Schema } from 'mongoose';

export interface ICartItem {
  product: Schema.Types.ObjectId;
  quantity: number;
  currency: string;
  color?: string;
  size?: string;
}

export interface ICart {
  user: Schema.Types.ObjectId;
  items: ICartItem[];
  updatedAt?: Date;
}
