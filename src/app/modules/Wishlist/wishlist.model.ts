// wishlist.model.ts
import { model, Schema } from "mongoose";
import { IWishlist } from "./wishlist.interface";


const wishlistSchema = new Schema<IWishlist>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    products: [{ type: Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true, versionKey: false }
);

export const Wishlist = model<IWishlist>("Wishlist", wishlistSchema);