
// ── Service ───────────────────────────────────────────────────────────────────

import { Follow } from "./follow.model";

 
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
 
  const following = await Follow.find({ follower: userId })
    .populate("following", "fullName email image role")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
 
  return {
    following: following.map((f: any) => f.following),
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
 
  const followers = await Follow.find({ following: userId })
    .populate("follower", "fullName email image role")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
 
  return {
    followers: followers.map((f: any) => f.follower),
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