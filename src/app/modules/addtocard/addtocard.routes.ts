
// ─────────────────────────────────────────────────────────────
// CART ROUTES (new cart router)

import { Router } from "express";
import auth from "../../middleware/auth.middleware";
import { USER_ROLE } from "../user/user.constant";
import { cartController } from "./addtocard.contoller";


// ─────────────────────────────────────────────────────────────
const cartRouter = Router();
 
// GET  /cart               → get user's cart
cartRouter.get("/get-cart", auth(USER_ROLE.USER), cartController.getCart);
 
// POST /cart               → add item  body: { productId, quantity, color?, size? }
cartRouter.post("/addto-card", auth(USER_ROLE.USER), cartController.addToCart);
 
// PUT  /cart               → update quantity  body: { productId, quantity, color?, size? }
cartRouter.put("/update-cart", auth(USER_ROLE.USER), cartController.updateCartItem);
 
// DELETE /cart/:productId  → remove single item
cartRouter.delete("/remove-from-cart/:productId", auth(USER_ROLE.USER), cartController.removeFromCart);
 
// DELETE /cart             → clear entire cart
cartRouter.delete("/clear-cart", auth(USER_ROLE.USER), cartController.clearCart);


 
export const cartRoutes = cartRouter;
 