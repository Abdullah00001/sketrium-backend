import { Router } from "express";
import { ContactController } from "./contact.controller";
import auth from "../../middleware/auth.middleware";
import { USER_ROLE } from "../user/user.constant";


 
const router = Router();
 
// Public
router.post("/create-contact",auth(USER_ROLE.USER ,USER_ROLE.ORGANIZER,USER_ROLE.KAATEDJ,USER_ROLE.MARCHANT), ContactController.create);
 
// Admin
router.get("/stats",auth(USER_ROLE.admin), ContactController.stats);

router.get("/", auth(USER_ROLE.admin), ContactController.getAll);
router.get("/:id", auth(USER_ROLE.admin), ContactController.getOne);
router.patch("/:id/status", auth(USER_ROLE.admin), ContactController.updateStatus);
router.delete("/:id", auth(USER_ROLE.admin), ContactController.remove);
router.post("/support-message", auth(USER_ROLE.USER ,USER_ROLE.ORGANIZER,USER_ROLE.KAATEDJ,USER_ROLE.MARCHANT), ContactController.sendSupportMessage);


export const ContactRoutes = router;
 