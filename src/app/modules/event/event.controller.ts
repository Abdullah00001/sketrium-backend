import mongoose from 'mongoose';
import AppError from '../../error/AppError';
import catchAsync from '../../utils/catchAsync';
import { uploadManyToS3, uploadToS3 } from '../../utils/fileHelper';
import sendResponse from '../../utils/sendResponse';
import { Event } from './event.model';
import { eventServices } from './event.service';
import httpStatus from 'http-status';

export const createEvent = catchAsync(async (req, res) => {
  let coverImage;
  let gallery: { id: string; url: string }[] = [];

  if (req.files && (req.files as any).coverImage) {
    const coverFile = (req.files as any).coverImage[0];
    coverImage = await uploadToS3(coverFile, 'events/cover');
  }

  if (req.files && (req.files as any).gallery) {
    const galleryFiles = (req.files as any).gallery;
    gallery = await uploadManyToS3(
      galleryFiles.map((file: any) => ({
        file,
        path: 'events/gallery',
      })),
    );
  }

  const result = await eventServices.createEventService(
    req.body,
    req.user,
    coverImage,
    gallery,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Event created successfully',
    data: result,
  });
});

export const getAllEventsService = catchAsync(async (req, res) => {
  const result = await eventServices.getAllEventsService(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Events fetched successfully',
    data: result,
  });
});
export const getAllEvents = catchAsync(async (req, res) => {
  const result = await eventServices.getAllEvents(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Events fetched successfully',
    data: result,
  });
});

export const getPastEvents = catchAsync(async (req, res) => {
  const result = await eventServices.getPastEventsService();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Past events fetched successfully',
    data: result,
  });
});

// GET /api/v1/events/:id
const getEventDetails = catchAsync(async (req, res) => {
  const currentUserId = req.user?._id; // token optional — না থাকলেও চলবে

  const result = await eventServices.getEventDetailsService(
    req.params.id as string,
    currentUserId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event details fetched successfully',
    data: result,
  });
});

// ── Controller ──────────────────────────────────────────────────────────────
export const updateEvent = catchAsync(async (req, res) => {
  let coverImage;
  let gallery: { id: string; url: string }[] = [];

  if (req.files && (req.files as any).coverImage) {
    coverImage = await uploadToS3(
      (req.files as any).coverImage[0],
      'events/cover',
    );
  }

  if (req.files && (req.files as any).gallery) {
    gallery = await uploadManyToS3(
      (req.files as any).gallery.map((file: any) => ({
        file,
        path: 'events/gallery',
      })),
    );
  }

  const result = await eventServices.updateEventService(
    req,
    coverImage,
    gallery,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Event updated successfully',
    data: result,
  });
});

export const deleteEvent = catchAsync(async (req, res) => {
  const result = await eventServices.deleteEventService(
    req.params.id as string,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Event deleted successfully',
    data: result,
  });
});

export const attendEvent = catchAsync(async (req, res) => {
  const result = await eventServices.attendEventService(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

export const addReview = catchAsync(async (req, res) => {
  const result = await eventServices.addReviewService(req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Review added successfully',
    data: result,
  });
});

const searchEvents = catchAsync(async (req, res) => {
  const result = await eventServices.searchEvents({
    q: req.query.q as string,
    category: req.query.category as string,
    country: req.query.country as string,
    skiteeventType: req.query.skiteeventType as string,
    minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
    maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
    date: req.query.date as string,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    organizer: req.query.organizer as string,
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 10,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Events fetched successfully',
    data: result,
  });
});

const getNearbyEvents = catchAsync(async (req, res) => {
  const location = req.query.location as string;
  if (!location) {
    return sendResponse(res, {
      statusCode: 400,
      success: false,
      message: 'Location is required',
      data: null,
    });
  }
  const result = await eventServices.getNearbyEvents(location);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Nearby events fetched',
    data: result,
  });
});

const getEventsByOrganizer = catchAsync(async (req, res) => {
  const result = await eventServices.getEventsByOrganizer(
    req.params.id as string,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Organizer events fetched',
    data: result,
  });
});

export const getAllCategories = catchAsync(async (req, res) => {
  const { category } = req.query;

  const result = await Event.find({ category })
    .populate('host', 'fullName image')
    .sort({ date: 1 });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Events fetched by category',
    data: result,
  });
});

// ─── GET /api/events?isPast=true|false ───────────────────────────────────────
const getEvents = catchAsync(async (req, res) => {
  try {
    const isPast = req.query.isPast === 'true';
    const events = isPast
      ? await eventServices.getPreviousEvents()
      : await eventServices.getUpcomingEvents();
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Events fetched successfully',
      data: events,
    });
  } catch (error: any) {
    sendResponse(res, {
      statusCode: 500,
      success: false,
      message: 'Something went wrong',
      data: null,
    });
  }
});

const getMyTicketsnewfilter = catchAsync(async (req, res) => {
  // ?filter=upcoming or ?filter=previous
  const filter = (req.query.filter as 'upcoming' | 'previous') || 'upcoming';

  const result = await eventServices.getMyTicketnew(
    req.user._id as string,
    filter,
    req.query.page ? Number(req.query.page) : 1,
    req.query.limit ? Number(req.query.limit) : 10,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `${filter === 'upcoming' ? 'Upcoming' : 'Previous'} tickets fetched successfully`,
    data: result,
  });
});

export const addReviewadd = catchAsync(async (req, res) => {
  const { eventId } = req.params;

  const userId = req.user?.id;

  const event = await Event.findById(eventId);

  if (!event) {
    throw new AppError(404, 'Event not found');
  }

  // ✅ ensure reviews array exists (fix TS + runtime issue)
  if (!event.reviews) {
    event.reviews = [];
  }

  // ❌ prevent duplicate review
  const alreadyReviewed = event.reviews.find(
    (r: any) => r.user.toString() === userId.toString(),
  );

  if (alreadyReviewed) {
    throw new AppError(400, 'You already reviewed this event');
  }

  // ✅ single image upload
  let image = { id: '', url: '' };

  if (req.files && (req.files as any).image) {
    const file = (req.files as any).image[0];
    image = await uploadToS3(file, 'events/reviews');
  }

  // ✅ create review
  const newReview = {
    user: userId,
    rating: Number(req.body.rating),
    comment: req.body.comment,
    images: image.url ? [image] : [],
    isAnonymous: req.body.isAnonymous || false,
  };

  // ✅ push review
  event.reviews.push(newReview as any);

  await event.save();

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    data: newReview,
  });
});

export const getAutoSuggestions = catchAsync(async (req, res) => {
  const { address } = req.query;

  const suggestions = await eventServices.getmapSuggestions(address as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Suggestions fetched successfully',
    data: suggestions,
  });
});

export const getNearbyEventsController = catchAsync(async (req, res) => {
  const { lat, lng, radius } = req.query;

  console.log('Received coordinates:', { lat, lng, radius }); // Debug log

  const events = await eventServices.getsearchEvents(
    Number(lat),
    Number(lng),
    radius ? Number(radius) : 10,
  );
  console.log('Nearby events:', events); // Debug log

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Nearby events fetched successfully',
    data: events,
  });
});

const getDashboardStats = catchAsync(async (req, res) => {
  const userId = req.user?._id;

  const year = req.query.year ? Number(req.query.year) : undefined;

  const result = await eventServices.getDashboardStats(userId, year);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Dashboard stats fetched successfully',
    data: result,
  });
});

const getEventChartData = catchAsync(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;

  const result = await eventServices.getEventChartData(
    req.params.eventId as string,
    year,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Dashboard stats fetched successfully',
    data: result,
  });
});
const getTotalEarningCards = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  const result = await eventServices.getTotalEarningCards(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Dashboard cards fetched successfully',
    data: result,
  });
});

// GET /api/v1/events/all?type=upcoming&search=sunset
// GET /api/v1/events/all?type=past
// GET /api/v1/events/all?search=skate
const getAllMyEvents = catchAsync(async (req, res) => {
  const userId = req?.user?._id;
  const query = req.query; // { type, search }

  const result = await eventServices.getAllMyEvents(userId, query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Events fetched successfully',
    data: result,
  });
});

const getRecentPayments = catchAsync(async (req, res) => {
  const userId = req.user?._id;

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const searchTerm = req.query.searchTerm as string;

  const result = await eventServices.getRecentPayments(
    userId,
    page,
    limit,
    searchTerm,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Recent payments fetched successfully',
    data: result.data,
    meta: result.meta,
  });
});

// GET /api/v1/events/:id/attendees?page=1&limit=10
const getEventAttendees = catchAsync(async (req, res) => {
  const { id } = req.params;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const skip = (page - 1) * limit;

  const event = await Event.findById(id)
    .populate({
      path: 'attendees',
      select: 'fullName email image',
      options: {
        skip,
        limit,
      },
    })
    .select('attendees title');

  if (!event) throw new AppError(httpStatus.NOT_FOUND, 'Event not found');

  // total attendees count (pagination এর জন্য)
  const eventForCount = await Event.findById(id).select('attendees');
  const totalAttendees = (eventForCount?.attendees || []).length;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Attendees fetched successfully',
    data: {
      eventTitle: event.title,
      attendees: event.attendees || [],
      pagination: {
        total: totalAttendees,
        page,
        limit,
        totalPages: Math.ceil(totalAttendees / limit),
      },
    },
  });
});

//new api

// GET /api/v1/events/featured
// ── Controller ────────────────────────────────────────────────────────────────
const getFeaturedEvents = catchAsync(async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;

  const result = await eventServices.getFeaturedEvents(page, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Featured events fetched successfully',
    data: result,
  });
});

// GET /api/v1/events/top?page=1&limit=10
const getTopEvents = catchAsync(async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const result = await eventServices.getTopEvents(page, limit);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Top events fetched successfully',
    data: result,
  });
});

// GET /api/v1/events/highlighted?page=1&limit=10
const getHighlightedEvents = catchAsync(async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const result = await eventServices.getHighlightedEvents(page, limit);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Highlighted events fetched successfully',
    data: result,
  });
});

// GET /api/v1/events/pinned?page=1&limit=10
const getPinnedEvents = catchAsync(async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const result = await eventServices.getPinnedEvents(page, limit);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pinned events fetched successfully',
    data: result,
  });
});

// GET /api/v1/events/home?lng=90.4125&lat=23.8103&page=1&limit=10
// location optional — না দিলে newest first
const getHomeEvents = catchAsync(async (req, res) => {
  const { lng, lat, page, limit } = req.query;

  const result = await eventServices.getHomeEvents(
    lng ? Number(lng) : undefined,
    lat ? Number(lat) : undefined,
    page ? Number(page) : 1,
    limit ? Number(limit) : 10,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Events fetched successfully',
    data: result,
  });
});

const getEventReviews = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { type, page, limit } = req.query;

  if (!type || !['product', 'event', 'user'].includes(type as string)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "type must be 'product', 'event' or 'user'",
    );
  }

  const result = await eventServices.getEventReviews(
    id as string,
    type as string,
    page ? Number(page) : 1,
    limit ? Number(limit) : 10,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reviews fetched successfully',
    data: result,
  });
});

const getUpcomingEventsByHostcontroller = catchAsync(async (req, res) => {
  const { hostId } = req.params;

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const result = await eventServices.getUpcomingEventsByHost(
    hostId as string,
    page,
    limit,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Upcoming events fetched successfully',
    data: result.data,
    meta: result.meta,
  });
});

// ───────────────── Controller ─────────────────

const getEventReviewsold = catchAsync(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  // ✅ correct service name
  const result = await eventServices.getEventReviewsnew(
    req.params.id as string,
    page,
    limit,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event reviews fetched successfully',

    // ✅ correct
    data: result.data,

    // ✅ correct meta format
    meta: result.meta,
  });
});

const getEventsByHost = catchAsync(async (req, res) => {
  const hostId = req.params.hostId as string;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const categoryId = req.query.categoryId as string; // ✅ নতুন

  const result = await eventServices.getEventsByHost(
    hostId,
    page,
    limit,
    categoryId,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Events fetched successfully',
    data: result,
  });
});

const addReplyToReview = catchAsync(async (req, res) => {
  const { comment, eventId, reviewId } = req.body;
  console.log('CONTROLLER DEBUG:', { comment, eventId, reviewId });
  console.log('USER:', req.user);
  if (!comment || comment.trim() === '') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Comment is required');
  }

  const result = await eventServices.addReplyToReview(
    req.user?.userId, // ✅ _id এর বদলে userId
    eventId as string,
    reviewId as string,
    comment,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Reply added successfully',
    data: result,
  });
});

export const eventcontroller = {
  createEvent,
  getAllEventsService,
  getPastEvents,
  getEventDetails,
  updateEvent,
  deleteEvent,
  attendEvent,
  addReview,
  getEventChartData,
  getTotalEarningCards,
  // search + extra features
  searchEvents,
  getFeaturedEvents,
  getNearbyEvents,
  getEventsByOrganizer,
  getAllCategories,
  getEvents,
  addReviewadd,
  getAutoSuggestions,
  getNearbyEventsController,
  getDashboardStats,
  getAllMyEvents,
  getRecentPayments,
  getMyTicketsnewfilter,
  getEventAttendees,
  getTopEvents,
  getHighlightedEvents,
  getPinnedEvents,
  getHomeEvents,
  getEventReviews,
  getUpcomingEventsByHostcontroller,
  getEventReviewsold,
  getEventsByHost,
  addReplyToReview,
  getAllEvents,
};
