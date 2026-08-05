import { Wishlist } from "./wishlist.model";
 
const getWishlist = async (userId: string) => {
  const wishlist = await Wishlist.findOne({ user: userId }).populate(
    "products",
    "name price images discount category"
  );
  return wishlist || { user: userId, products: [] };
};
 
const toggleWishlist = async (userId: string, productId: string) => {
  let wishlist = await Wishlist.findOne({ user: userId });
 
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, products: [] });
  }
 
  const index = wishlist.products.findIndex(
    (p: any) => p.toString() === productId
  );
 
  let action: "added" | "removed";
 
  if (index > -1) {
    wishlist.products.splice(index, 1);
    action = "removed";
  } else {
    wishlist.products.push(productId as any);
    action = "added";
  }
 
  await wishlist.save();
 
  return {
    action,
    wishlist: await wishlist.populate(
      "products",
      "name price images discount category"
    ),
  };
};
 
const removeFromWishlist = async (userId: string, productId: string) => {
  return await Wishlist.findOneAndUpdate(
    { user: userId },
    { $pull: { products: productId } },
    { new: true }
  ).populate("products", "name price images discount category");
};
 
export const wishlistService = {
  getWishlist,
  toggleWishlist,
  removeFromWishlist,
};