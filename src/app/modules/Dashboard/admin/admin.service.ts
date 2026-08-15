import httpStatus from 'http-status';
import { Admin } from './admin.model';
import AppError from '../../../error/AppError';
import User from '../../user/user.model';
import { Event } from '../../event/event.model';
import { Order } from '../../userOrder/userOrder.model';
import { Ticket } from '../../Ticke/ticke.model';
import { updatePastEvents } from '../../../utils/updatePastEvents';
import { ro } from 'date-fns/locale/ro';
import { Personalization } from '../../Personalizationuser/Personalization.model';
import SocialLink from '../../sociallink/soscial.model';
import PaymentHistory from '../../subPayment/subpayment.model';

const updateAdminProfile = async (id: string, payload: Record<string, any>) => {
  console.log('Update id:', id);
  console.log('Payload:', payload);

  const allowedFields = ['fullName', 'phoneNumber', 'image'];
  const updateData: Record<string, any> = {};

  allowedFields.forEach(field => {
    if (payload[field] !== undefined) {
      updateData[field] = payload[field];
    }
  });

  const admin = await Admin.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!admin) throw new AppError(httpStatus.NOT_FOUND, 'Admin not found');
  return admin;
};

const changePassword = async (
  id: string,
  oldPassword: string,
  newPassword: string,
) => {
  const admin = await Admin.findById(id).select('+password');
  if (!admin) throw new AppError(404, 'Admin not found');

  const isMatch = await admin.isPasswordMatched(oldPassword);
  if (!isMatch) throw new AppError(401, 'Old password incorrect');

  admin.password = newPassword;
  await admin.save();
};

const setForgotOtp = async (email: string) => {
  const admin = await Admin.findOne({ email });
  if (!admin) throw new AppError(404, 'Admin not found');

  const otp = Math.floor(100000 + Math.random() * 900000);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  admin.verification = { otp, expiresAt, verified: false };
  await admin.save();

  return otp;
};

const verifyOtp = async (email: string, otp: number) => {
  const admin = await Admin.findOne({ email });
  if (!admin || !admin.verification)
    throw new AppError(404, 'OTP not generated');

  if (admin.verification.verified)
    throw new AppError(400, 'OTP already verified');

  if (Date.now() > new Date(admin.verification.expiresAt).getTime()) {
    throw new AppError(400, 'OTP expired');
  }

  if (admin.verification.otp !== otp) throw new AppError(400, 'Invalid OTP');

  admin.verification.verified = true;
  await admin.save();
};

const resetPassword = async (email: string, newPassword: string) => {
  const admin = await Admin.findOne({ email }).select('+password');
  if (!admin || !admin.verification?.verified) {
    throw new AppError(400, 'OTP not verified');
  }

  admin.password = newPassword;
  admin.verification = undefined;
  await admin.save();
};

//admin dasbord api

// ── Admin Dashboard ────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// const getAdminDashboard = async (
//   year?: number,
//   analyticsType: string = "tickets",
//   page: number = 1,
//   limit: number = 10
// ) => {

//   await updatePastEvents(); // ✅ query এর আগে update করুন
//   const targetYear = year || new Date().getFullYear();
//   const skip = (page - 1) * limit;

//   // ── Active Users count ────────────────────────────────────
//   const activeUsers = await User.countDocuments({
//     isDeleted: false,
//     isActive: true,
//   });

//   // ── Ongoing Events count ──────────────────────────────────
//   const ongoingEvents = await Event.countDocuments({
//     isPast: false,
//     isDeleted: false,
//   });

//   // ── Total Earning (tickets + orders) ─────────────────────
//   const ticketEarning = await Ticket.aggregate([
//     { $match: { paymentStatus: "paid", isDeleted: false } },
//     { $group: { _id: null, total: { $sum: "$totalAmount" } } },
//   ]);

//   const orderEarning = await Order.aggregate([
//     { $match: { paymentStatus: "paid", isDeleted: false } },
//     { $group: { _id: null, total: { $sum: "$total" } } },
//   ]);

//   const totalEarning =
//     (ticketEarning[0]?.total || 0) + (orderEarning[0]?.total || 0);

//   // ── Platform Analytics (monthly) ──────────────────────────
//   let monthlyAnalytics;

//   if (analyticsType === "tickets") {
//     const raw = await Ticket.aggregate([
//       {
//         $match: {
//           paymentStatus: "paid",
//           isDeleted: false,
//           createdAt: {
//             $gte: new Date(`${targetYear}-01-01`),
//             $lte: new Date(`${targetYear}-12-31`),
//           },
//         },
//       },
//       {
//         $group: {
//           _id: { $month: "$createdAt" },  // ✅ fixed
//           count: { $sum: "$quantity" },
//         },
//       },
//       { $sort: { _id: 1 } },
//     ]);

//     monthlyAnalytics = Array.from({ length: 12 }, (_, i) => {
//       const found = raw.find((r) => r._id === i + 1);
//       return {
//         month: i + 1,
//         name: MONTH_NAMES[i],  // ✅ month name added
//         count: found?.count || 0,
//       };
//     });

//   } else {
//     const raw = await Order.aggregate([
//       {
//         $match: {
//           paymentStatus: "paid",
//           isDeleted: false,
//           createdAt: {
//             $gte: new Date(`${targetYear}-01-01`),
//             $lte: new Date(`${targetYear}-12-31`),
//           },
//         },
//       },
//       {
//         $group: {
//           _id: { $month: "$createdAt" },  // ✅ fixed
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { _id: 1 } },
//     ]);

//     monthlyAnalytics = Array.from({ length: 12 }, (_, i) => {
//       const found = raw.find((r) => r._id === i + 1);
//       return {
//         month: i + 1,
//         name: MONTH_NAMES[i],  // ✅ month name added
//         count: found?.count || 0,
//       };
//     });
//   }

//   // ── Event List (latest) ───────────────────────────────────
// const now = new Date();

// const eventList = await Event.find({
//   isDeleted: false,
//   isPast: false,
//   date: { $gte: now }  // ✅ শুধু future events
// })
//   .populate("host", "fullName image")
//   .populate("category", "name")
//   .sort({ date: 1 })  // ✅ date ascending — সবচেয়ে কাছের date আগে
//   .limit(5)
//   .select("title date coverImage location");

//   // ── New Users (latest with pagination) ───────────────────
//   const totalUsers = await User.countDocuments({ isDeleted: false });

//   const newUsers = await User.find({ isDeleted: false })
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(limit)
//     .select("fullName image email role isActive isVerified createdAt");

//   return {
//     stats: {
//       activeUsers,
//       ongoingEvents,
//       totalEarning,
//     },
//     analytics: {
//       type: analyticsType,
//       year: targetYear,
//       data: monthlyAnalytics,
//     },
//     eventList,
//     newUsers: {
//       users: newUsers,
//       pagination: {
//         total: totalUsers,
//         page,
//         limit,
//         totalPages: Math.ceil(totalUsers / limit),
//       },
//     },
//   };
// };

// ── Get All Users (Admin) ─────────────────────────────────────────────────────

const getAdminDashboard = async (
  year?: number,
  analyticsType: string = 'tickets',
  page: number = 1,
  limit: number = 10,
) => {
  await updatePastEvents();

  const targetYear = year || new Date().getFullYear();
  const skip = (page - 1) * limit;

  const startDate = new Date(`${targetYear}-01-01T00:00:00.000Z`);
  const endDate = new Date(`${targetYear}-12-31T23:59:59.999Z`);

  // ── ACTIVE USERS ─────────────────────────────
  const activeUsers = await User.countDocuments({
    isDeleted: false,
    isActive: true,
  });

  // ── ONGOING EVENTS ───────────────────────────
  const ongoingEvents = await Event.countDocuments({
    isPast: false,
    isDeleted: false,
  });

  // ─────────────────────────────────────────────
  // 💰 TOTAL EARNING (CURRENCY WISE)
  // ─────────────────────────────────────────────

  const ticketEarningRaw = await Ticket.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        isDeleted: false,
      },
    },
    {
      $lookup: {
        from: 'events',
        localField: 'event',
        foreignField: '_id',
        as: 'event',
      },
    },
    { $unwind: '$event' },
    {
      $project: {
        currency: { $ifNull: ['$event.currency', 'USD'] },
        amount: '$totalAmount',
      },
    },
  ]);

  const orderEarningRaw = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        isDeleted: false,
      },
    },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $project: {
        currency: { $ifNull: ['$product.currency', 'USD'] },
        amount: {
          $multiply: ['$items.price', '$items.quantity'],
        },
      },
    },
  ]);

  const eventGrouped = ticketEarningRaw.reduce((acc: any, item) => {
    const currency = item.currency || 'USD';
    if (!acc[currency]) acc[currency] = 0;
    acc[currency] += item.amount;
    return acc;
  }, {});

  const eventEarning = Object.keys(eventGrouped).map(currency => ({
    currency,
    amount: eventGrouped[currency],
  }));

  const productGrouped = orderEarningRaw.reduce((acc: any, item) => {
    const currency = item.currency || 'USD';
    if (!acc[currency]) acc[currency] = 0;
    acc[currency] += item.amount;
    return acc;
  }, {});

  const productEarning = Object.keys(productGrouped).map(currency => ({
    currency,
    amount: productGrouped[currency],
  }));

  const subscriptionEarningRaw = await PaymentHistory.aggregate([
    {
      $match: {
        status: { $in: ['succeeded', 'active'] },
        isDeleted: false,
      },
    },
    {
      $project: {
        currency: { $toUpper: { $ifNull: ['$currency', 'USD'] } },
        amount: '$amount',
      },
    },
  ]);

  const subscriptionGrouped = subscriptionEarningRaw.reduce((acc: any, item) => {
    const currency = item.currency || 'USD';
    if (!acc[currency]) acc[currency] = 0;
    acc[currency] += item.amount / 100; // Assuming amounts in PaymentHistory are in cents
    return acc;
  }, {});

  const subscriptionEarning = Object.keys(subscriptionGrouped).map(currency => ({
    currency,
    amount: subscriptionGrouped[currency],
  }));

  const combinedEarnings = [...ticketEarningRaw, ...orderEarningRaw, ...subscriptionEarningRaw.map(x => ({ ...x, amount: x.amount / 100 }))];
  const earningGrouped = combinedEarnings.reduce((acc: any, item) => {
    const currency = item.currency || 'USD';
    if (!acc[currency]) acc[currency] = 0;
    acc[currency] += item.amount;
    return acc;
  }, {});
  
  const totalEarning = Object.keys(earningGrouped).map(currency => ({
    currency,
    amount: earningGrouped[currency],
  }));

  // ─────────────────────────────────────────────
  // 📊 MONTHLY ANALYTICS (CURRENCY WISE)
  // ─────────────────────────────────────────────

  const ticketRaw = await Ticket.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        isDeleted: false,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: 'events',
        localField: 'event',
        foreignField: '_id',
        as: 'event',
      },
    },
    { $unwind: '$event' },
    {
      $project: {
        month: { $month: '$createdAt' },
        currency: { $ifNull: ['$event.currency', 'USD'] },
        amount: '$totalAmount',
      },
    },
  ]);

  const orderRaw = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        isDeleted: false,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $project: {
        month: { $month: '$createdAt' },
        currency: { $ifNull: ['$product.currency', 'USD'] },
        amount: {
          $multiply: ['$items.price', '$items.quantity'],
        },
      },
    },
  ]);

  const combinedMonthly = [...ticketRaw, ...orderRaw];

  const monthlyGrouped = combinedMonthly.reduce((acc: any, item) => {
    const month = item.month;
    const currency = item.currency || 'USD';

    if (!acc[month]) acc[month] = {};
    if (!acc[month][currency]) acc[month][currency] = 0;

    acc[month][currency] += item.amount;

    return acc;
  }, {});

  const monthlyAnalytics = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const currencies = monthlyGrouped[month] || {};

    return {
      month: MONTH_NAMES[i],
      amount: Object.keys(currencies).map(currency => ({
        currency,
        price: currencies[currency],
      })),
    };
  });

  // ── EVENT LIST ───────────────────────────────
  const now = new Date();

  const eventList = await Event.find({
    isDeleted: false,
    isPast: false,
    date: { $gte: now },
  })
    .populate('host', 'fullName image')
    .populate('category', 'name')
    .sort({ date: 1 })
    .limit(5)
    .select('title date coverImage location');

  // ── NEW USERS ────────────────────────────────
  const totalUsers = await User.countDocuments({ isDeleted: false });

  const newUsers = await User.find({ isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('fullName image email role isActive isVerified createdAt');

  // ── FINAL RESPONSE ───────────────────────────
  return {
    stats: {
      activeUsers,
      ongoingEvents,
      totalEarning,
      eventEarning,
      subscriptionEarning,
      productEarning,
    },

    analytics: {
      type: analyticsType,
      year: targetYear,
      data: monthlyAnalytics,
    },

    eventList,

    newUsers: {
      users: newUsers,
      pagination: {
        total: totalUsers,
        page,
        limit,
        totalPages: Math.ceil(totalUsers / limit),
      },
    },
  };
};

const getAllUsers = async (
  search?: string,
  page: number = 1,
  limit: number = 10,
) => {
  const skip = (page - 1) * limit;

  const filter: any = { isDeleted: false, role: 'USER' };

  if (search && search.trim() !== '') {
    filter.$or = [
      { fullName: { $regex: search.trim(), $options: 'i' } },
      { email: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const total = await User.countDocuments(filter);

  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select(
      'fullName country phoneNumber status accountType email image role isActive isVerified createdAt',
    );

  return {
    users,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ── Block User ────────────────────────────────────────────────────────────────
const blockUser = async (userId: string) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { isActive: false } },
    { new: true },
  ).select('fullName email isActive');

  if (!user) throw new Error('User not found');
  return user;
};

// ── Unblock User ──────────────────────────────────────────────────────────────
const unblockUser = async (userId: string) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { isActive: true } },
    { new: true },
  ).select('fullName email isActive');

  if (!user) throw new Error('User not found');
  return user;
};

// ── Delete User ───────────────────────────────────────────────────────────────
const deleteUser = async (userId: string) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { isDeleted: true } },
    { new: true },
  );

  if (!user) throw new Error('User not found');
  return { message: 'User deleted successfully' };
};
const getSingleUser = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // ✅ Personalization data — থাকলে আসবে, না থাকলে null
  const personalization = await Personalization.findOne({ user: userId });

  // ✅ SocialLink data — থাকলে আসবে, না থাকলে null
  const socialLink = await SocialLink.findOne({ user: userId });

  return {
    ...user.toObject(),
    personalization: personalization ?? null,
    socialLink: socialLink ?? null,
  };
};

export const adminService = {
  updateAdminProfile,
  changePassword,
  setForgotOtp,
  verifyOtp,
  resetPassword,
  getAdminDashboard,
  getAllUsers,
  blockUser,
  unblockUser,
  deleteUser,
  getSingleUser,
};
