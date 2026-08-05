

// // personalization.interface.ts
// import { Types } from "mongoose";

// export interface IPersonalization {
//   user: Types.ObjectId;

//   // Personalization 1 — Skating Interests (multi select)
//   interests: string[];

//   // Personalization 2 — (next screen, likely location or age — extend korte parbe)
//   // Personalization 3 — (next screen)

//   // Personalization 4 — Skill Level (single select)
//   skillLevel: "Beginner" | "Intermediate" | "Advanced" | "";

//   // Personalization 5 — Years Skating (single select)
//   yearsSkating:
//     | "0-5 years"
//     | "6-10 years"
//     | "11-25 years"
//     | "16-20 years"
//     | "20+ years"
//     | "";

//   isCompleted: boolean; // sob step complete hoile true
//   createdAt?: Date;
//   updatedAt?: Date;
// }




import { Types } from "mongoose";
 
export interface IPersonalization {
  user: Types.ObjectId;
 
  // Skating Interests
  interests: string[];
 
  // Skill Level
  skillLevel: "Beginner" | "Intermediate" | "Advanced" | "";
 
  // Years Skating
  yearsSkating:
    | "0-5 years"
    | "6-10 years"
    | "11-25 years"
    | "16-20 years"
    | "20+ years"
    | "";
 
  // ── Screen 1: Experience & Event Information ──────────────────
  hasOrganizedEvents: "Yes" | "No" | "";
  planningEventTypes: string[];
  typicalEventCapacity: "1-10" | "11-50" | "51-100" | "101-500" | "500+" | "";
  previousEventLinks: string[];
  socialMediaLinks: string[];
 
  // ── Screen 2: Legal & Safety Information ─────────────────────
  hasPublicLiabilityInsurance: "Yes" | "No" | "";
  personallyResponsibleForSafety: boolean;
  hasCodeOfConduct: "Yes" | "No" | "";
  codeOfConductFileUrl: string;
  codeOfConductLink: string;
  subscribedToEmails: boolean;
  agreedToOrganizerTerms: boolean;
 
  // Completion
  isCompleted: boolean;
 
  createdAt?: Date;
  updatedAt?: Date;
}
