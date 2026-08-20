// personalization.service.ts

import httpStatus from "http-status";
import { addContactToBrevo } from "../../utils/mailSender";
import User from "../user/user.model";
import { Personalization } from "./Personalization.model";

 
// ─── 1. Step save — frontend step by step pathabe ─────────────────────────
// Frontend har step e call korbe, je fields ache shegulo pathabe
const savePersonalization = async (
  userId: string,
  data: {
    interests?: string[];
    skillLevel?: string;
    yearsSkating?: string;
  }
) => {
  // upsert — already thakle update, na thakle create
  const personalization = await Personalization.findOneAndUpdate(
    { user: userId },
    { ...data },
    { new: true, upsert: true }
  );
 
  return personalization;
};
 




const updatePersonalizationkk = async (
  userId: string,
  payload: {
    interests?: string[];
    skillLevel?: string;
    yearsSkating?: string;
  }
) => {
  const { interests, skillLevel, yearsSkating } = payload;

  const result = await Personalization.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        ...(interests && { interests }),
        ...(skillLevel && { skillLevel }),
        ...(yearsSkating && { yearsSkating }),
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  return result;
};
 




const getPersonalizationByUser = async (userId: string) => {
  const result = await Personalization.findOne({ user: userId })
    .populate("user"); 

  return result;
};


//full profile update  api 
const updateProfileWithPersonalization = async (
  userId: string,
  payload: any,
  image?: any
) => {
  const {
    interests,
    skillLevel,
    yearsSkating,
    isCompleted,
    ...userFields
  } = payload;

  // 1️⃣ USER update (image included)
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        ...userFields,
        ...(image && { image }),
      },
    },
    { new: true }
  );

  if (updatedUser && updatedUser.subscribeToEmails) {
    addContactToBrevo(updatedUser.email, updatedUser.fullName).catch(console.error);
  }

  // 2️⃣ PERSONALIZATION update
  const updatedPersonalization = await Personalization.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        ...(interests && { interests }),
        ...(skillLevel && { skillLevel }),
        ...(yearsSkating && { yearsSkating }),
        ...(isCompleted !== undefined && { isCompleted }),
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  return {
    user: updatedUser,
    personalization: updatedPersonalization,
  };
};




//new api 


// ── Upsert (create if not exists, update if exists) ───────────────────────────
// ── Upsert (create if not exists, update if exists) ───────────────────────────
const upsertPersonalization = async (
  userId: string,
  payload: any
) => {
  const result = await Personalization.findOneAndUpdate(
    { user: userId },          // filter — find by logged-in user
    { $set: payload },          // only update provided fields
    {
      new: true,                // return the updated document
      upsert: true,             // create if not found
      runValidators: true,      // run mongoose schema validators on update
      setDefaultsOnInsert: true,// apply schema defaults on first create
    }
  );
 
  return result;
};
 



//original update api
const upsertPersonalizationoriginal = async (userId: string, payload: any) => {
  const result = await Personalization.findOneAndUpdate(
    { user: userId },
    { $set: payload },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );
  return result;
};



export const personalizationService = {
  savePersonalization,
  getPersonalizationByUser,
  updatePersonalizationkk,
  updateProfileWithPersonalization,
  upsertPersonalization,
  upsertPersonalizationoriginal,
};