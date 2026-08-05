
// personalization.controller.ts
import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { personalizationService } from "./Personalization.service";
import { uploadToS3 } from "../../utils/fileHelper";
import httpStatus  from 'http-status';
import User from "../user/user.model";


 
 
const savePersonalization = catchAsync(async (req: Request, res: Response) => {
  const { interests, skillLevel, yearsSkating } = req.body;
  const result = await personalizationService.savePersonalization(
    req.user._id,
    { interests, skillLevel, yearsSkating }
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Personalization saved",
    data: result,
  });
});
 
 
 
 

 






const updatePersonalization = catchAsync(async (req: Request, res: Response) => {
  const { interests, skillLevel, yearsSkating } = req.body;

  const result = await personalizationService.savePersonalization(
    req.user._id,
    { interests, skillLevel, yearsSkating }
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Personalization saved",
    data: result,
  });
});

//GEL  Personalization er data dekhte ─────────────────────────

const getPersonalization = catchAsync(async (req: Request, res: Response) => {
  const result = await personalizationService.getPersonalizationByUser(
    req.user._id
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Personalization fetched successfully",
    data: result,
  });
});




const updateProfile = catchAsync(async (req: Request, res: Response) => {
  let image;

  // 1️⃣ Upload image if provided
  if (req.file) {
    image = await uploadToS3(req.file, "profile/");
  }

  // 2️⃣ ONLY FROM TOKEN (SECURE)
  const userId = req.user._id;

  // 3️⃣ Build update data
  const updateData: Record<string, any> = {
    ...req.body,
    ...(image && { image }),
  };

  // 4️⃣ Remove forbidden fields (security)
  const forbiddenFields = ["role", "isVerified"];
  forbiddenFields.forEach((key) => delete updateData[key]);

  // 5️⃣ Call service (User + Personalization update)
  const result =
    await personalizationService.updateProfileWithPersonalization(
      userId,
      updateData,
      image
    );

  // 6️⃣ Response
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});










//new update api 

// Token দিয়ে call করবে — create না থাকলে create, থাকলে update (upsert)

// ── POST/PATCH  /api/v1/personalization  ─────────────────────────────────────
const upsertPersonalization = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
 
  const result = await personalizationService.upsertPersonalization(
    userId,
    req.body
  );
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Personalization saved successfully",
    data: result,
  });
});








//original update api


const upsertPersonalizationoriginal = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
 console.log("userId →", userId);
  // ── Text data (body থেকে) ─────────────────────────────────────
  const payload: any = {};
 
  // Boolean fields — multipart/form-data তে string হিসেবে আসে, convert করতে হবে
  const booleanFields = [
    "personallyResponsibleForSafety",
    "subscribedToEmails",
    "agreedToOrganizerTerms",
  ];
 
  // Array fields
  const arrayFields = [
    "interests",
    "planningEventTypes",
    "previousEventLinks",
    "socialMediaLinks",
  ];
 
  // সব body fields payload এ add করো
  Object.keys(req.body).forEach((key) => {
    if (booleanFields.includes(key)) {
      // "true" string → true boolean
      payload[key] = req.body[key] === "true" || req.body[key] === true;
    } else if (arrayFields.includes(key)) {
      // array হিসেবে parse করো
      payload[key] = Array.isArray(req.body[key])
        ? req.body[key]
        : [req.body[key]];
    } else {
      payload[key] = req.body[key];
    }
  });
  console.log("req.file →", req.file);
console.log("req.body →", req.body);
 
  // ── File upload (S3) ──────────────────────────────────────────
  if (req.file) {
    const uploaded = await uploadToS3(
      req.file,
      "personalization/code-of-conduct"
    );
    payload.codeOfConductFileUrl = uploaded.url;
  }

  const { subscribedToEmails, ...personalizationPayload } = payload;
   
if (payload.subscribedToEmails !== undefined) {
  await User.findByIdAndUpdate(userId, {
    $set: { subscribeToEmails: payload.subscribedToEmails },
  });
}
  // ── Upsert ────────────────────────────────────────────────────
  const result = await personalizationService.upsertPersonalization(
    userId,
    payload
  );
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Personalization saved successfully",
    data: result,
  });
});


export const personalizationController = {
  savePersonalization,
  getPersonalization,
  updatePersonalization,
  updateProfile,
  upsertPersonalizationoriginal,

};