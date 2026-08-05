import { Event } from "../modules/event/event.model";

// export const updatePastEvents = async () => {
//   const now = new Date();
//   await Event.updateMany(
//     {
//       isPast: false,
//       isDeleted: false,
//       date: { $lt: now },
//     },
//     { $set: { isPast: true } }
//   );
// };


export const updatePastEvents = async () => {
  const now = new Date();

  await Event.updateMany(
    {
      isPast: false,
      isDeleted: false,
      // 🔥 ফিক্সড: ইভেন্টের endDate (শেষ তারিখ) এখনকার সময়ের চেয়ে কম বা পার হয়ে গেছে কি না চেক হবে
      endDate: { $lt: now }, 
    },
    { 
      $set: { isPast: true } 
    }
  );
};