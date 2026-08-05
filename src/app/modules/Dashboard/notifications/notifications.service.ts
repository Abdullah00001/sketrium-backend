import User from "../../user/user.model";
import admin from "./Firebase";
import { Notification } from "./notifications.model";


// // ── Send Custom Notification (Admin) ─────────────────────────────────────────
// const sendCustomNotification = async (
//   adminId: string,
//   title: string,
//   description: string,
//   targetRole: string // "USER" | "MARCHANT" | "ORGANIZER"
// ) => {
//   // Target role এর সব user এর fcmToken নাও
//   const filter: any = {
//     isDeleted: false,
//     isActive: true,
//     fcmToken: { $exists: true, $ne: "" },
//   };

//   if (targetRole !== "ALL") {
//     filter.role = targetRole;
//   }

//   const users = await User.find(filter).select("fcmToken");
//   const tokens = users
//     .map((u: any) => u.fcmToken)
//     .filter(Boolean);

//   if (tokens.length === 0) {
//     return { message: "No users with FCM token found", sentCount: 0 };
//   }

//   // Firebase FCM — batch send (max 500 per batch)
//   const chunkSize = 500;
//   let sentCount = 0;

//   for (let i = 0; i < tokens.length; i += chunkSize) {
//     const chunk = tokens.slice(i, i + chunkSize);

//     const message = {
//       notification: {
//         title,
//         body: description,
//       },
//       tokens: chunk,
//     };

//     const response = await admin.messaging().sendEachForMulticast(message);
//     sentCount += response.successCount;
//   }

//   // DB তে save করো
//   await Notification.create({
//     title,
//     description,
//     targetRole,
//     sentBy: adminId,
//     sentCount,
//   });

//   return {
//     message: `Notification sent successfully`,
//     sentCount,
//     totalUsers: tokens.length,
//   };
// };




const sendCustomNotification = async (
  adminId: string,
  title: string,
  description: string,
  targetRole: string
) => {

 
  // ✅ fcmToken condition সরিয়ে দিন
  const filter: any = {
    isDeleted: false,
    isActive: true,
  };

  if (targetRole !== "ALL") {
    filter.role = targetRole;
  }

  const users = await User.find(filter).select("fcmToken");
  const tokens = users.map((u: any) => u.fcmToken).filter(Boolean);

  let sentCount = 0;

  // ✅ token থাকলে FCM send করো, না থাকলে skip করো
  if (tokens.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      const message = {
        notification: {
          title,
          body: description,
        },
        tokens: chunk,
      };
      const response = await admin.messaging().sendEachForMulticast(message);
      sentCount += response.successCount;
    }
  }

  // ✅ token থাকুক বা না থাকুক — সবসময় DB তে save হবে
  await Notification.create({
    title,
    description,
    targetRole,
    sentBy: adminId,
    sentCount,
  });

  return {
    message: "Notification sent successfully",
    sentCount,
    totalUsers: users.length,
  };
};











// ── Get All Notifications (Admin history) ─────────────────────────────────────
const getNotificationHistory = async (page: number = 1, limit: number = 10) => {
  const skip = (page - 1) * limit;
  const total = await Notification.countDocuments();

  const notifications = await Notification.find()
  .populate("sentBy", "fullName  image") // ✅ এখন কাজ করবে
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);

  return {
    notifications,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const NotificationService = {
  sendCustomNotification,
  getNotificationHistory,
};