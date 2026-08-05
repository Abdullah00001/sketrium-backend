// wishlist.routes.ts
import { Router } from "express";
import { USER_ROLE } from "../user/user.constant";
import auth from "../../middleware/auth.middleware";
import { wishlistController } from "./wishlist.controller";

 
const router = Router();
 
// GET  /wishlist               — user er wishlist dekha
router.get("/get-wishlist", auth(USER_ROLE.USER), wishlistController.getWishlist);
 
// POST /wishlist/:productId    — toggle (add korle add, already thakle remove)
router.post("/toggle/:productId", auth(USER_ROLE.USER), wishlistController.toggleWishlist);
 
// DELETE /wishlist/:productId  — specific product remove
router.delete("/remove/:productId", auth(USER_ROLE.USER), wishlistController.removeFromWishlist);
 
export const wishlistRoutes = router;