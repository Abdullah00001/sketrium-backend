// personalization.routes.ts
import { Router } from "express";
import { USER_ROLE } from "../user/user.constant";
import auth from "../../middleware/auth.middleware";
import { personalizationController } from "./Personalization.controller";
import upload from "../../middleware/fileUpload";



const router = Router();


// POST /personalization         — step by step save
// body: { interests?, skillLevel?, yearsSkating? }
router.post(
  "/create",
  auth(USER_ROLE.USER),
  personalizationController.savePersonalization
);


router.put("/update",auth(USER_ROLE.USER),personalizationController.updatePersonalization);

router.get("/get", auth(USER_ROLE.USER,USER_ROLE.ORGANIZER), personalizationController.getPersonalization);



router.put( "/update-userprofile",auth(USER_ROLE.USER),upload.single("file"),personalizationController.updateProfile);






// ── Upsert API (create or update) ───────────────────────────────────────────────

// POST — create or update (upsert) + optional file upload
router.post(
  "/data",
  auth(USER_ROLE.ORGANIZER),
  upload.single("codeOfConductFile"), // ← multer middleware, field name "codeOfConductFile"
  personalizationController.upsertPersonalizationoriginal
);
 
// PATCH — partial update + optional file upload
router.patch(
  "/data",
  auth(USER_ROLE.ORGANIZER),
  upload.single("codeOfConductFile"),
  personalizationController.upsertPersonalizationoriginal
);


export const personalizationRoutes = router;

