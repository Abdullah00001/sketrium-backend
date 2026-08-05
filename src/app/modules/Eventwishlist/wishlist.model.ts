// event.wishlist.model.ts
import { model, Schema } from "mongoose";
import { IEventWishlist } from "./wishlist.interface";


const eventWishlistSchema = new Schema<IEventWishlist>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    events: [{ type: Schema.Types.ObjectId, ref: "Event" }],
  },
  { timestamps: true, versionKey: false }
);

export const EventWishlist = model<IEventWishlist>(
  "EventWishlist",
  eventWishlistSchema
);