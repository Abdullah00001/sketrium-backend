// event.wishlist.service.ts

import { EventWishlist } from "./wishlist.model";


export const getEventWishlist = async (
  userId: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
 
  const wishlist = await EventWishlist.findOne({ user: userId });
  const totalEvents = wishlist?.events?.length || 0;
 
  const paginatedWishlist = await EventWishlist.findOne({ user: userId })
    .populate({
      path: "events",
      select: "title date time location coverImage category price isPast",
      options: { skip, limit },
    });
 
  return {
    events: paginatedWishlist?.events || [],
    pagination: {
      total: totalEvents,
      page,
      limit,
      totalPages: Math.ceil(totalEvents / limit),
    },
  };
};


const toggleEventWishlist = async (userId: string, eventId: string) => {
  let wishlist = await EventWishlist.findOne({ user: userId });

  if (!wishlist) {
    wishlist = await EventWishlist.create({ user: userId, events: [] });
  }

  const index = wishlist.events.findIndex(
    (e: any) => e.toString() === eventId
  );

  let action: "added" | "removed";

  if (index > -1) {
    wishlist.events.splice(index, 1);
    action = "removed";
  } else {
    wishlist.events.push(eventId as any);
    action = "added";
  }

  await wishlist.save();

  return {
    action,
    wishlist: await wishlist.populate(
      "events",
      "title date time location coverImage category price isPast"
    ),
  };
};


const removeEventFromWishlist = async (userId: string, eventId: string) => {
  return await EventWishlist.findOneAndUpdate(
    { user: userId },
    { $pull: { events: eventId } },
    { new: true }
  ).populate("events", "title date time location coverImage category price isPast");
};


export const eventWishlistService = {
  getEventWishlist,
  toggleEventWishlist,
  removeEventFromWishlist,
};