

// // personalization.model.ts
// import { model, Schema } from "mongoose";
// import { IPersonalization } from "./Personalization.interface";

 
// const personalizationSchema = new Schema<IPersonalization>(
//   {
//     user: {
//       type: Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//       unique: true, // per user ekta personalization record
//     },
 
//     // Personalization 1 — Skating Interests
//     interests: [
//       {
//         type: String,
//         enum: [
//           "Cone Skating",
//           "Artistic Skating",
//           "Rhythm/Line Skating",
//           "Inline Derby",
//           "Freestyle Skating",
//           "Ramp Skating",
//           "Downhill / Marathon Skating",
//           "Freestyle Slalom Skating",
//           "Distance / Marathon Skating",
//           "Park Skating",
//           "Speed Skating",
//           "Aggressive Skating",
//           "Slalom Skating",
//           "Quad Skating",
//           "Inline Hockey",
//         ],
//       },
//     ],
 
//     // Personalization 4 — Skill Level
//     skillLevel: {
//       type: String,
//       enum: ["Beginner", "Intermediate", "Advanced", ""],
//       default: "",
//     },
 
//     // Personalization 5 — Years Skating
//     yearsSkating: {
//       type: String,
//       enum: [
//         "0-5 years",
//         "6-10 years",
//         "11-25 years",
//         "16-20 years",
//         "20+ years",
//         "",
//       ],
//       default: "",
//     },
 
//     isCompleted: {
//       type: Boolean,
//       default: false,
//     },
//   },
//   { timestamps: true, versionKey: false }
// );
 
// export const Personalization = model<IPersonalization>(
//   "Personalization",
//   personalizationSchema
// );


import { model, Schema } from "mongoose";
import { IPersonalization } from "./Personalization.interface";

const personalizationSchema = new Schema<IPersonalization>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // per user ekta personalization record
    },

    // Personalization 1 — Skating Interests
    interests: [
      {
        type: String,
        enum: [
          "Cone Skating",
          "Artistic Skating",
          "Rhythm/Line Skating",
          "Inline Derby",
          "Freestyle Skating",
          "Ramp Skating",
          "Downhill / Marathon Skating",
          "Freestyle Slalom Skating",
          "Distance / Marathon Skating",
          "Park Skating",
          "Speed Skating",
          "Aggressive Skating",
          "Slalom Skating",
          "Quad Skating",
          "Inline Hockey",
        ],
      },
    ],

    // Personalization 4 — Skill Level
    skillLevel: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced", ""],
      default: "",
    },

    // Personalization 5 — Years Skating
    yearsSkating: {
      type: String,
      enum: [
        "0-5 years",
        "6-10 years",
        "11-25 years",
        "16-20 years",
        "20+ years",
        "",
      ],
      default: "",
    },

    // "Have you organized skating events before?"
    hasOrganizedEvents: {
      type: String,
      enum: ["Yes", "No", ""],
      default: "",
    },

    // "What types of events are you planning to list?"
    planningEventTypes: [
      {
        type: String,
        enum: [
          "Park Skating",
          "Artistic Skating",
          "Rhythm/Line Skating",
          "Roller Derby",
          "Freestyle Skating",
          "Ramp Skating",
          "Distance / Marathon Skating",
          "Freestyle Skating",
          "Speed Skating",
          "Park Skating",
          "Outdoor / Street Skating",
          "Aggressive Skating",
          "Slalom Skating",
          "Quad Skating",
          "Inline Hockey",
          "Street Skating",
        // "Street Skating",
        // "Roller Derby",
        // "Park Skating",
        // "Artistic Skating",
        // "Speed Skating"
       
        ],
         default: "",
      },
    ],

    // "What is the capacity of attendees at your typical events?"
    typicalEventCapacity: {
      type: String,
      enum: [
        "1-10",
        "11-50",
        "51-100",
        "101-500",
        "500+",
        "Less than 20", "20-49", "50-199", "200-499", 'More than 500',
        "",
      ],
      default: "",
    },

    // "Links to previous events or social media"
    previousEventLinks: [
      {
        type: String,
         default: "",
        trim: true,
      },
    ],

    // "Please provide links to your social media / previous events or website"
    socialMediaLinks: [
      {
        type: String,
         default: "",
        trim: true,
      },
    ],

    // ─────────────────────────────────────────────────────────────
    // Screen 2 — Legal & Safety Information (Figma)
    // ─────────────────────────────────────────────────────────────

    // "Do you have public liability insurance for your events?"
    hasPublicLiabilityInsurance: {
      type: String,
      enum: ["Yes", "No", ""],
      default: "",
    },

    // "I will be personally responsible for maintaining safety"
    personallyResponsibleForSafety: {
      type: Boolean,
      default: false,
    },

    // "Do you have a code of conduct or safety policy for your events?"
    hasCodeOfConduct: {
      type: String,
      enum: ["Yes", "No", ""],
      default: "",
    },

    // "Upload Code of conduct and/or Safety Policy" — file URL (optional)
    codeOfConductFileUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // "Code of conduct / review Safety Policy link" — external link (optional)
    codeOfConductLink: {
      type: String,
      default: "",
      trim: true,
    },

    // "Subscribe me to emails"
    // subscribedToEmails: {
    //   type: Boolean,
    //   default: false,
    // },

    // "I agree to the Organizer Terms & Conditions"
    agreedToOrganizerTerms: {
      type: Boolean,
      // default: "",
      default: false,
    },

    // ─────────────────────────────────────────────────────────────
    // Completion flag
    // ─────────────────────────────────────────────────────────────
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false }
);

export const Personalization = model<IPersonalization>(
  "Personalization",
  personalizationSchema
);