
// ── Service ───────────────────────────────────────────────────────────────────

import { Follow } from "./follow.model";
import { Review } from "../profilereview/profilereview.model";

 
// Toggle Follow/Unfollow
export const toggleFollow = async (followerId: string, followingId: string) => {
  if (followerId === followingId) {
    throw new Error("You cannot follow yourself");
  }
 
  const existing = await Follow.findOne({
    follower: followerId,
    following: followingId,
  });
 
  if (existing) {
    // Already follow করা আছে → unfollow
    await Follow.deleteOne({ _id: existing._id });
    return { followed: false, message: "Unfollowed successfully" };
  } else {
    // follow করা নেই → follow
    await Follow.create({ follower: followerId, following: followingId });
    return { followed: true, message: "Followed successfully" };
  }
};
 
// আমি কাদের follow করছি
export const getFollowing = async (
  userId: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const total = await Follow.countDocuments({ follower: userId });
 
  const followingList = await Follow.find({ follower: userId })
    .populate("following", "fullName email image coverImage isActive country phoneNumber role accountType isVerified createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
 
  const usersWithStats = await Promise.all(
    followingList.map(async (f: any) => {
      const user = f.following;
      if (!user) return null;

      const followersCount = await Follow.countDocuments({ following: user._id });

      const ratingResult = await Review.aggregate([
        { $match: { organizer: user._id, isDeleted: { $ne: true } } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
      ]);

      const avgRating = ratingResult[0]?.avgRating ? parseFloat(ratingResult[0].avgRating.toFixed(1)) : 0;
      const totalReviews = ratingResult[0]?.totalReviews || 0;

      const hasReviewed = !!(await Review.findOne({
        organizer: user._id,
        reviewer: userId,
        isDeleted: { $ne: true }
      }));

      return {
        ...user.toObject(),
        followersCount,
        avgRating,
        totalReviews,
        isFollowing: true,
        hasReviewed
      };
    })
  );

  return {
    users: usersWithStats.filter(u => u !== null),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};
 
// আমার followers কারা
export const getFollowers = async (
  userId: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const total = await Follow.countDocuments({ following: userId });
 
  const followersList = await Follow.find({ following: userId })
    .populate("follower", "fullName email image coverImage isActive country phoneNumber role accountType isVerified createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
 
  const usersWithStats = await Promise.all(
    followersList.map(async (f: any) => {
      const user = f.follower;
      if (!user) return null;

      const followersCount = await Follow.countDocuments({ following: user._id });

      const ratingResult = await Review.aggregate([
        { $match: { organizer: user._id, isDeleted: { $ne: true } } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
      ]);

      const avgRating = ratingResult[0]?.avgRating ? parseFloat(ratingResult[0].avgRating.toFixed(1)) : 0;
      const totalReviews = ratingResult[0]?.totalReviews || 0;

      const isFollowing = !!(await Follow.findOne({
        follower: userId,
        following: user._id,
      }));

      const hasReviewed = !!(await Review.findOne({
        organizer: user._id,
        reviewer: userId,
        isDeleted: { $ne: true }
      }));

      return {
        ...user.toObject(),
        followersCount,
        avgRating,
        totalReviews,
        isFollowing,
        hasReviewed
      };
    })
  );

  return {
    users: usersWithStats.filter(u => u !== null),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};
 
// Follow status check
export const checkFollowStatus = async (
  followerId: string,
  followingId: string
) => {
  const existing = await Follow.findOne({
    follower: followerId,
    following: followingId,
  });
  return { isFollowing: !!existing };
};



export const FollowService = { toggleFollow, getFollowing, getFollowers, checkFollowStatus };