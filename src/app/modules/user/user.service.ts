import AppError from '../../error/AppError';
import httpStatus from 'http-status';
import User from './user.model';
import { TUser } from './user.interface';
import bcrypt from 'bcrypt';
import QueryBuilder from '../../builder/QueryBuilder';
import { subMonths, startOfMonth } from 'date-fns';
import { Review } from '../profilereview/profilereview.model';
import { Follow } from '../Follow/follow.model';
import { Event } from '../event/event.model';
import { Product } from '../product/product.model';
import SocialLink from '../sociallink/soscial.model';
import { Personalization } from '../Personalizationuser/Personalization.model';
import { USER_ROLE } from './user.constant';
import jwt, { Secret } from 'jsonwebtoken';
import config from '../../config';
import { Cart } from '../addtocard/addtotocard.model';
import { EventWishlist } from '../Eventwishlist/wishlist.model';
import { Wishlist } from '../Wishlist/wishlist.model';
import { BalanceModel } from '../Balance/balance.model';
import { WithdrawalModel } from '../withdrawal/withdrawal.model';
import PromoCode from '../PromoCode/promocode.model';
import { Order } from '../userOrder/userOrder.model';
import { Ticket } from '../Ticke/ticke.model';
import PaymentHistory from '../subPayment/subpayment.model';
import { Report } from '../profilereview/profilereview.model';
import { ProductReviewReport } from '../Productreviewreport/Productreviewreport.model';
import { EventReviewReport } from '../Eventreviewreport/Eventreviewreport.model';
import { Contact } from '../Contact/contact.model';

const getme = async (id: string) => {
  const result = await User.findById(id);

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const socialLinks = await SocialLink.findOne({ user: result._id });
  const personalization = await Personalization.findOne({ user: result._id });
  const balance = await BalanceModel.findOne({ userId: result._id });

  return {
    ...result.toObject(),
    socialLinks,
    personalization,
    balance,
  };
};

//update user profile

const updateProfile = async (id: string, payload: Partial<TUser>) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const restrictedFields = ['role', 'email'];
  restrictedFields.forEach(field => {
    if (field in payload) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `${field} is not allowed to update`,
      );
    }
  });

  // Allow updating image, fullName, gender
  const updatedUser = await User.findByIdAndUpdate(id, payload, {
    new: true,
  });

  return updatedUser;
};

const getAllUsers = async (query: Record<string, any>) => {
  const usersQuery = new QueryBuilder(
    User.find({ isDeleted: { $ne: true } }),
    query,
  )
    .search(['fullName', 'email', 'phoneNumber']) // searchable fields
    .filter()
    .paginate()
    .sort()
    .fields();

  const users = await usersQuery.modelQuery;
  const meta = await usersQuery.countTotal();

  const data = await Promise.all(
    users.map(async (user: any) => {
      const followersCount = await Follow.countDocuments({
        following: user._id,
      });
      const followingCount = await Follow.countDocuments({
        follower: user._id,
      });

      const ratingResult = await Review.aggregate([
        { $match: { organizer: user._id, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
          },
        },
      ]);
      const avgRating = ratingResult[0]?.avgRating
        ? parseFloat(ratingResult[0].avgRating.toFixed(1))
        : 0;
      const totalReviews = ratingResult[0]?.totalReviews || 0;

      const eventCount = await Event.countDocuments({
        host: user._id,
        isDeleted: false,
      });
      const productCount = await Product.countDocuments({
        host: user._id,
        isDeleted: false,
      });

      const socialLinks = await SocialLink.findOne({ user: user._id }).select(
        '-__v -createdAt -updatedAt -user',
      );
      const personalization = await Personalization.findOne({
        user: user._id,
      }).select('-__v -createdAt -updatedAt -user');
      const balance = await BalanceModel.findOne({ userId: user._id }).select(
        'currentBalance stripeAccountId stripeOnboarded',
      );

      return {
        ...user.toObject(),
        followersCount,
        followingCount,
        avgRating,
        totalReviews,
        eventCount,
        productCount,
        socialLinks: socialLinks || null,
        personalization: personalization || null,
        balance: balance || null,
      };
    }),
  );

  return { data, meta };
};

const getSingleUser = async (id: string) => {
  const result = await User.findById(id);

  if (!result || result.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const followersCount = await Follow.countDocuments({ following: result._id });
  const followingCount = await Follow.countDocuments({ follower: result._id });

  const ratingResult = await Review.aggregate([
    { $match: { organizer: result._id, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
      },
    },
  ]);
  const avgRating = ratingResult[0]?.avgRating
    ? parseFloat(ratingResult[0].avgRating.toFixed(1))
    : 0;
  const totalReviews = ratingResult[0]?.totalReviews || 0;

  const eventCount = await Event.countDocuments({
    host: result._id,
    isDeleted: false,
  });
  const productCount = await Product.countDocuments({
    host: result._id,
    isDeleted: false,
  });

  const socialLinks = await SocialLink.findOne({ user: result._id }).select(
    '-__v -createdAt -updatedAt -user',
  );
  const personalization = await Personalization.findOne({
    user: result._id,
  }).select('-__v -createdAt -updatedAt -user');
  const balance = await BalanceModel.findOne({ userId: result._id }).select(
    'currentBalance stripeAccountId stripeOnboarded',
  );

  return {
    ...result.toObject(),
    followersCount,
    followingCount,
    avgRating,
    totalReviews,
    eventCount,
    productCount,
    socialLinks: socialLinks || null,
    personalization: personalization || null,
    balance: balance || null,
  };
};

const deleteAccount = async (id: string, password: string) => {
  const user = await User.IsUserExistbyId(id);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.NOT_ACCEPTABLE, 'Password does not match!');
  }

  const result = await User.findByIdAndUpdate(
    id,
    { $set: { isDeleted: true } },
    { new: true },
  );

  return result;
};
const deleteUser = async (id: string) => {
  const user = await User.findById(id).select('_id');
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const [
    ownedProducts,
    ownedEvents,
    balance,
    profileReviews,
    productReviewGroups,
    eventReviewGroups,
  ] = await Promise.all([
    Product.find({ host: user._id }).select('_id'),
    Event.find({ host: user._id }).select('_id'),
    BalanceModel.findOne({ userId: user._id }).select('_id'),
    Review.find({
      $or: [{ organizer: user._id }, { reviewer: user._id }],
    }).select('_id'),
    Product.aggregate<{ reviewIds: unknown[] }>([
      { $match: { 'reviews.user': user._id } },
      {
        $project: {
          reviewIds: {
            $map: {
              input: {
                $filter: {
                  input: '$reviews',
                  as: 'review',
                  cond: { $eq: ['$$review.user', user._id] },
                },
              },
              as: 'review',
              in: '$$review._id',
            },
          },
        },
      },
    ]),
    Event.aggregate<{ reviewIds: unknown[] }>([
      { $match: { 'reviews.user': user._id } },
      {
        $project: {
          reviewIds: {
            $map: {
              input: {
                $filter: {
                  input: '$reviews',
                  as: 'review',
                  cond: { $eq: ['$$review.user', user._id] },
                },
              },
              as: 'review',
              in: '$$review._id',
            },
          },
        },
      },
    ]),
  ]);

  const productIds = ownedProducts.map(product => product._id);
  const eventIds = ownedEvents.map(event => event._id);
  const reviewIds = profileReviews.map(review => review._id);
  const productReviewIds = productReviewGroups.flatMap(
    group => group.reviewIds,
  );
  const eventReviewIds = eventReviewGroups.flatMap(group => group.reviewIds);

  // Remove documents that only belong to this account.
  await Promise.all([
    Cart.deleteMany({ user: user._id }),
    EventWishlist.deleteMany({ user: user._id }),
    Wishlist.deleteMany({ user: user._id }),
    SocialLink.deleteMany({ user: user._id }),
    Personalization.deleteMany({ user: user._id }),
    Follow.deleteMany({
      $or: [{ follower: user._id }, { following: user._id }],
    }),
    Order.deleteMany({ user: user._id }),
    Ticket.deleteMany({ user: user._id }),
    PaymentHistory.deleteMany({ user: user._id }),
    Contact.deleteMany({ user: user._id }),
    Review.deleteMany({
      $or: [{ organizer: user._id }, { reviewer: user._id }],
    }),
    Report.deleteMany({
      $or: [{ reportedBy: user._id }, { review: { $in: reviewIds } }],
    }),
    ProductReviewReport.deleteMany({
      $or: [
        { reportedBy: user._id },
        ...(productIds.length ? [{ product: { $in: productIds } }] : []),
        ...(productReviewIds.length
          ? [{ review: { $in: productReviewIds } }]
          : []),
      ],
    }),
    EventReviewReport.deleteMany({
      $or: [
        { reportedBy: user._id },
        ...(eventIds.length ? [{ event: { $in: eventIds } }] : []),
        ...(eventReviewIds.length ? [{ review: { $in: eventReviewIds } }] : []),
      ],
    }),
    PromoCode.deleteMany({ createdBy: user._id }),
  ]);

  if (balance) {
    await WithdrawalModel.deleteMany({ driverProfileId: balance._id });
  }
  await BalanceModel.deleteMany({ userId: user._id });

  // Keep historical products/events addressable, but hide content owned by the
  // deleted account and remove the account from content owned by other users.
  await Promise.all([
    Product.updateMany({ host: user._id }, { $set: { isDeleted: true } }),
    Event.updateMany({ host: user._id }, { $set: { isDeleted: true } }),
    Product.updateMany(
      { 'reviews.user': user._id },
      { $pull: { reviews: { user: user._id } } },
    ),
    Product.updateMany(
      { 'reviews.replies.user': user._id },
      { $pull: { 'reviews.$[].replies': { user: user._id } } },
    ),
    Event.updateMany(
      { 'reviews.user': user._id },
      { $pull: { reviews: { user: user._id } } },
    ),
    Event.updateMany(
      { 'reviews.replies.user': user._id },
      { $pull: { 'reviews.$[].replies': { user: user._id } } },
    ),
    Event.updateMany(
      { attendees: user._id },
      { $pull: { attendees: user._id } },
    ),
    Review.updateMany(
      { 'reply.organizer': user._id },
      { $set: { reply: null } },
    ),
    PromoCode.updateMany(
      { usedBy: user._id },
      { $set: { usedBy: null, isUsed: false } },
    ),
    ...(productIds.length
      ? [
          Cart.updateMany(
            { 'items.product': { $in: productIds } },
            { $pull: { items: { product: { $in: productIds } } } },
          ),
          Wishlist.updateMany(
            { products: { $in: productIds } },
            { $pull: { products: { $in: productIds } } },
          ),
        ]
      : []),
    ...(eventIds.length
      ? [
          EventWishlist.updateMany(
            { events: { $in: eventIds } },
            { $pull: { events: { $in: eventIds } } },
          ),
        ]
      : []),
  ]);

  await User.deleteOne({ _id: user._id });

  return { id: user._id, deleted: true };
};

const updatePhoneNumber = async (id: string, payload: Partial<TUser>) => {
  const allowedPayload = {
    phoneNumber: payload.phoneNumber,
    countryCode: payload.countryCode,
  };

  const result = await User.findByIdAndUpdate(id, allowedPayload, {
    new: true,
  });

  return result;
};
//Get total users count excluding soft-deleted users
const getTotalUsersCount = async () => {
  const count = await User.countDocuments({ isDeleted: { $ne: true } });
  return count;
};
//Get monthly user starts
const getMonthlyUserStats = async () => {
  const startOfCurrentMonth = new Date();
  startOfCurrentMonth.setDate(1);
  startOfCurrentMonth.setHours(0, 0, 0, 0);

  const startOfPreviousMonth = new Date(startOfCurrentMonth);
  startOfPreviousMonth.setMonth(startOfPreviousMonth.getMonth() - 1);

  const endOfPreviousMonth = new Date(startOfCurrentMonth);

  const currentMonthUsers = await User.countDocuments({
    isDeleted: { $ne: true },
    createdAt: { $gte: startOfCurrentMonth },
  });

  const previousMonthUsers = await User.countDocuments({
    isDeleted: { $ne: true },
    createdAt: { $gte: startOfPreviousMonth, $lt: startOfCurrentMonth },
  });

  const difference = currentMonthUsers - previousMonthUsers;
  const percentageChange =
    previousMonthUsers > 0
      ? (difference / previousMonthUsers) * 100
      : currentMonthUsers > 0
        ? 100
        : 0;

  return {
    currentCount: currentMonthUsers,
    previousCount: previousMonthUsers,
    percentageChange: parseFloat(percentageChange.toFixed(2)),
    trend: percentageChange >= 0 ? 'up' : 'down',
  };
};
const getUsersLast12Months = async (year?: number) => {
  const now = new Date();
  const baseDate = year ? new Date(year, 11, 31) : now;
  const start = startOfMonth(subMonths(baseDate, 11));

  const users = await User.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
        createdAt: { $gte: start, $lte: baseDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        total: { $sum: 1 },
      },
    },
    {
      $sort: {
        '_id.year': 1,
        '_id.month': 1,
      },
    },
  ]);

  const data: { month: string; total: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = subMonths(baseDate, i);
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();

    const found = users.find(
      u => u._id.year === year && u._id.month === date.getMonth() + 1,
    );

    data.push({ month, total: found?.total || 0 });
  }

  return data;
};

const getUserGrowthPercentage = async (year?: number) => {
  const users = await getUsersLast12Months(year);
  const first = users[0]?.total || 0;
  const last = users[11]?.total || 0;

  const difference = last - first;
  const percentageChange =
    first > 0 ? (difference / first) * 100 : last > 0 ? 100 : 0;

  return {
    users,
    growthPercentage: parseFloat(percentageChange.toFixed(2)),
    trend: percentageChange >= 0 ? 'up' : 'down',
  };
};
const blockUser = async (id: string) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (
    user.role === 'admin' ||
    user.role === 'USER' ||
    user.role === 'ORGANIZER'
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot block an admin');
  }
  if (!user.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User is already blocked');
  }
  user.isActive = false;
  await user.save();

  return user;
};

const unblockUser = async (id: string) => {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (user.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User is already active');
  }

  user.isActive = true;
  await user.save();

  return user;
};

const switchAccount = async (userId: string, role: string) => {
  if (role === USER_ROLE.admin)
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot switch as an admin');
  const result = await User.findByIdAndUpdate(
    userId,
    { role: role },
    { new: true },
  );

  if (!result)
    throw new AppError(httpStatus.BAD_REQUEST, 'Account switching filed');

  const accessToken = jwt.sign(
    {
      id: result?._id,
      role: result.role,
    },
    config.jwt.jwt_access_secret as Secret,
    { expiresIn: '30d' },
  );

  const refreshToken = jwt.sign(
    {
      id: result._id,
      role: result.role,
    },
    config.jwt.jwt_refresh_secret as Secret,
    { expiresIn: '30d' },
  );
  return {
    accessToken,
    refreshToken,
    user: result,
  };
};

const getUsersByRole = async (
  role: string = 'ORGANIZER',
  search?: string,
  page: number = 1,
  limit: number = 10,
  currentUserId?: string,
  country?: string,
  planningEventTypes?: string, // ✅ নতুন — শুধু ORGANIZER এর জন্য
) => {
  const skip = (page - 1) * limit;

  const filter: any = {
    role,
    isDeleted: false,
  };

  if (search && search.trim() !== '') {
    filter.$or = [
      { fullName: { $regex: search.trim(), $options: 'i' } },
      { email: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  if (country && country.trim() !== '') {
    filter.country = { $regex: country.trim(), $options: 'i' };
  }

  // ✅ ORGANIZER — planningEventTypes দিয়ে Personalization থেকে filter
  if (
    role === 'ORGANIZER' &&
    planningEventTypes &&
    planningEventTypes.trim() !== ''
  ) {
    const typesArray = planningEventTypes
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const matchedPersonalizations = await Personalization.find({
      planningEventTypes: { $in: typesArray },
    }).select('user');

    const matchedUserIds = matchedPersonalizations.map((p: any) => p.user);

    filter._id = { $in: matchedUserIds };
  }

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select(
      'fullName email image coverImage isActive country phoneNumber role accountType isVerified createdAt',
    );

  const usersWithStats = await Promise.all(
    users.map(async (user: any) => {
      const followersCount = await Follow.countDocuments({
        following: user._id,
      });

      const ratingResult = await Review.aggregate([
        {
          $match: {
            organizer: user._id,
            isDeleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
          },
        },
      ]);

      const avgRating = ratingResult[0]?.avgRating
        ? parseFloat(ratingResult[0].avgRating.toFixed(1))
        : 0;
      const totalReviews = ratingResult[0]?.totalReviews || 0;

      const isFollowing = currentUserId
        ? !!(await Follow.findOne({
            follower: currentUserId,
            following: user._id,
          }))
        : false;

      const hasReviewed = currentUserId
        ? !!(await Review.findOne({
            organizer: user._id,
            reviewer: currentUserId,
            isDeleted: { $ne: true },
          }))
        : false;

      return {
        ...user.toObject(),
        followersCount,
        avgRating,
        totalReviews,
        isFollowing,
        hasReviewed,
      };
    }),
  );

  return {
    users: usersWithStats,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getOrganizerProfile = async (
  organizerId: string,
  currentUserId?: string,
) => {
  // ── User data ─────────────────────────────────────────────
  const user = await User.findById(organizerId).select(
    'fullName email image coverImage about country phoneNumber role bio socialLinks isVerified createdAt',
  );
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  // ── Event count ───────────────────────────────────────────
  const eventCount = await Event.countDocuments({
    host: organizerId,
    isDeleted: false,
  });

  // ── Following count (কতজনকে follow করে) ──────────────────
  const followingCount = await Follow.countDocuments({
    follower: organizerId,
  });

  // ── Followers count (কতজন follow করে) ────────────────────
  const followersCount = await Follow.countDocuments({
    following: organizerId,
  });

  // ── Review count & avg rating ─────────────────────────────
  const ratingResult = await Review.aggregate([
    {
      $match: {
        organizer: user._id,
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const avgRating = ratingResult[0]?.avgRating
    ? parseFloat(ratingResult[0].avgRating.toFixed(1))
    : 0;
  const totalReviews = ratingResult[0]?.totalReviews || 0;

  // ── isFollowing (current user follow করেছে কিনা) ──────────
  const isFollowing = currentUserId
    ? !!(await Follow.findOne({
        follower: currentUserId,
        following: organizerId,
      }))
    : false;

  // ── Upcoming Events (latest 5) ────────────────────────────
  const upcomingEvents = await Event.find({
    host: organizerId,
    isPast: false,
    isDeleted: false,
    date: { $gte: new Date() },
  })
    .populate('category', 'name')
    .sort({ date: 1 })
    .limit(5)
    .select('title date time location coverImage price isFeatured eventType');

  // ── Reviews (latest 3) ────────────────────────────────────
  const reviews = await Review.find({
    organizer: organizerId,
    isDeleted: false,
  })
    .populate('reviewer', 'fullName image isAnonymous')
    .sort({ createdAt: -1 })
    .limit(3)
    .select('rating comment createdAt isAnonymous reply reviewer');

  return {
    user: {
      ...user.toObject(),
      eventCount,
      followingCount,
      followersCount,
      totalReviews,
      avgRating,
      isFollowing,
    },
    upcomingEvents,
    reviews,
  };
};

const getMarchantProfile = async (
  marchantId: string,
  currentUserId?: string,
) => {
  const user = await User.findById(marchantId).select(
    'fullName email image coverImage country phoneNumber  about role bio isVerified createdAt djname',
  );
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  // ── Social Links ──────────────────────────────────────────
  const socialLinks = await SocialLink.findOne({ user: marchantId }).select(
    'shopName shopLink facebook instagram linkedin twitter youtube tiktok website',
  );

  // ── Product count ─────────────────────────────────────────
  const productCount = await Product.countDocuments({
    host: marchantId,
    isDeleted: false,
  });

  // ── Following count ───────────────────────────────────────
  const followingCount = await Follow.countDocuments({ follower: marchantId });

  // ── Followers count ───────────────────────────────────────
  const followersCount = await Follow.countDocuments({ following: marchantId });

  // ── Review count & avg rating ─────────────────────────────
  const ratingResult = await Review.aggregate([
    { $match: { organizer: user._id, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const avgRating = ratingResult[0]?.avgRating
    ? parseFloat(ratingResult[0].avgRating.toFixed(1))
    : 0;
  const totalReviews = ratingResult[0]?.totalReviews || 0;

  // ── isFollowing ───────────────────────────────────────────
  const isFollowing = currentUserId
    ? !!(await Follow.findOne({
        follower: currentUserId,
        following: marchantId,
      }))
    : false;

  // ── Products ──────────────────────────────────────────────
  const products = await Product.find({
    host: marchantId,
    isDeleted: false,
  })
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('name price images category colors sizes discount stock');

  // ── Reviews ───────────────────────────────────────────────
  const reviews = await Review.find({
    organizer: marchantId,
    isDeleted: false,
  })
    .populate('reviewer', 'fullName image')
    .sort({ createdAt: -1 })
    .limit(3)
    .select('rating comment createdAt isAnonymous reply reviewer');

  return {
    user: {
      ...user.toObject(),
      productCount,
      followingCount,
      followersCount,
      totalReviews,
      avgRating,
      isFollowing,
      socialLinks: socialLinks || null,
    },
    products,
    reviews,
  };
};

export type TSubscriberQuery = {
  page?: string;
  limit?: string;
  search?: string;
};

const getAllSubscribers = async (query: TSubscriberQuery) => {
  const { page = '1', limit = '10', search = '' } = query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  // Only subscribeToEmails: true users আসবে
  const filter: Record<string, unknown> = {
    isDeleted: false,
    subscribeToEmails: true,
  };

  // Search by name or email
  if (search.trim()) {
    filter.$or = [
      { fullName: { $regex: search.trim(), $options: 'i' } },
      { email: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('_id fullName email subscribeToEmails isActive createdAt image')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),

    User.countDocuments(filter),
  ]);

  return {
    users,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  };
};

// const getAllUsers = async (query:Record<string, any>)=>{}
export const userServices = {
  getme,
  switchAccount,
  updateProfile,
  getSingleUser,
  deleteAccount,
  getUsersByRole,
  getOrganizerProfile,
  updatePhoneNumber,
  getAllUsers,
  getTotalUsersCount,
  getMonthlyUserStats,
  getUsersLast12Months,
  getUserGrowthPercentage,
  blockUser,
  unblockUser,
  getMarchantProfile,
  getAllSubscribers,
  deleteUser,
};
