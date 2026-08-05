// event.wishlist.interface.ts
import { Types } from "mongoose";

export interface IEventWishlist {
  user: Types.ObjectId;
  events: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}