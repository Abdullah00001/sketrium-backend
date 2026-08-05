// event.wishlist.routes.ts
import { Router } from "express";
import { USER_ROLE } from "../user/user.constant";
import auth from "../../middleware/auth.middleware";
import { eventWishlistController } from "./wishlist.controller";

 
const router = Router();
 
// GET    /event-wishlist             — user er sob saved events
router.get("/event-wishlist", auth(USER_ROLE.USER), eventWishlistController.getEventWishlist);
 
// POST   /event-wishlist/:eventId    — toggle (add/remove)
router.post("/event-wishlist/:eventId",auth(USER_ROLE.USER),eventWishlistController.toggleEventWishlist);
 
// DELETE /event-wishlist/:eventId    — specific event remove
router.delete("/event-wishlist/:eventId", auth(USER_ROLE.USER),eventWishlistController.removeEventFromWishlist);
 
export const eventWishlistRoutes = router;