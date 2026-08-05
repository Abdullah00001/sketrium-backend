// order.interface.ts
import { Types } from "mongoose";

export interface IOrderItem {
  product: Types.ObjectId;
  quantity: number;
  color?: string;
  size?: string;
  price: number;
}

export interface IShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  state?: string;
  postcode?: string;
  apartment?: string;
}


export interface IOrder {
  user: Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  orderStatus: "processing" | "shipped" | "delivered" | "cancelled";
  stripePaymentIntentId: string;
  isDeleted: boolean;
  oderid:string,
  createdAt?: Date;
  updatedAt?: Date;
}