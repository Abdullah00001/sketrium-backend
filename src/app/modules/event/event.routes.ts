import { Router } from 'express';
import { USER_ROLE } from '../user/user.constant';
import upload from '../../middleware/fileUpload';
import auth from '../../middleware/auth.middleware';
import { eventcontroller } from './event.controller';
import checkSubscription from '../../middleware/checkSubscription';

const router = Router();

//checkSubscription(['pro','free'])
router.post(
  '/create-event',
  auth(USER_ROLE.ORGANIZER, USER_ROLE.admin),
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'gallery', maxCount: 10 },
  ]),
  eventcontroller.createEvent,
);

//done
router.get(
  '/getAll',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  eventcontroller.getAllEventsService,
);
//not done
router.get(
  '/getPast',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  eventcontroller.getPastEvents,
);
//done
router.get(
  '/getevent-details/:id',
  // auth(USER_ROLE.USER, USER_ROLE.ORGANIZER, USER_ROLE.admin),
  eventcontroller.getEventDetails,
);
//done
router.put(
  '/update-event/:id',
  auth(USER_ROLE.ORGANIZER),
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'gallery', maxCount: 10 },
  ]),
  eventcontroller.updateEvent,
);
router.delete(
  '/delete-event/:id',
  auth(USER_ROLE.ORGANIZER, USER_ROLE.admin),
  eventcontroller.deleteEvent,
);

router.post(
  '/attend-event/:id',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.attendEvent,
);

// router.post("/add-review/:id", auth(USER_ROLE.USER,), eventcontroller.addReview);

// ─────────────────────────────────────────────────────────────
// EVENT ROUTES (add to existing event router)
// ─────────────────────────────────────────────────────────────
// GET /events/search?q=disco&category=music&country=BD&minPrice=0&maxPrice=500&date=2024-12-01&page=1&limit=10
router.get(
  '/search',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  eventcontroller.searchEvents,
);

// GET /events/featured

//ai tar aktu somosa asa
router.get(
  '/featured',
  auth(USER_ROLE.USER),
  eventcontroller.getFeaturedEvents,
);

// GET /events/nearby?location=Dhaka

router.get('/nearby', auth(USER_ROLE.USER), eventcontroller.getHomeEvents);

// GET /events/organizer/:id
router.get(
  '/organizer/:id',
  auth(USER_ROLE.USER),
  eventcontroller.getEventsByOrganizer,
);

// GET /events/categories
router.get(
  '/categories',
  auth(USER_ROLE.USER),
  eventcontroller.getAllCategories,
);

router.get('/events', auth(USER_ROLE.USER), eventcontroller.getEvents); // GET /api/events?isPast=true|false

// POST   /api/events/:eventId/reviews
// ✅ multer field name: "images" (same style as gallery in event)
router.post(
  '/create-review/:eventId',
  auth(USER_ROLE.USER),
  upload.fields([{ name: 'image', maxCount: 1 }]),
  eventcontroller.addReviewadd,
);

//map
// GET /api/events/map-suggestions?address=Dhaka
router.get(
  '/map-suggestions',
  auth(USER_ROLE.USER),
  eventcontroller.getAutoSuggestions,
);

router.get(
  '/nearby-events',
  auth(USER_ROLE.USER),
  eventcontroller.getNearbyEventsController,
);

//done

// ── Dashboard (organizer only) ────────────────────────────────────────────────
router.get(
  '/dashboard',
  auth(USER_ROLE.ORGANIZER),
  eventcontroller.getDashboardStats,
);
router.get(
  '/dashboard/cards',
  auth(USER_ROLE.ORGANIZER),
  eventcontroller.getTotalEarningCards,
);

// ── All Events (upcoming / past / search) — Figma "All Events" screen ─────────
// GET /api/v1/events/all?type=upcoming
// GET /api/v1/events/all?type=past
// GET /api/v1/events/all?search=sunset
// GET /api/v1/events/all?type=upcoming&search=sunset
router.get('/all', auth(USER_ROLE.ORGANIZER), eventcontroller.getAllMyEvents);

// ── Recent Payments ───────────────────────────────────────────────────────────
router.get(
  '/recent-payments',
  auth(USER_ROLE.ORGANIZER),
  eventcontroller.getRecentPayments,
);

router.get(
  '/myall-tickets',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getMyTicketsnewfilter,
);

// ── Event Attendees List ──────────────────────────────────────────────────────
router.get(
  '/attendees/:id',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getEventAttendees,
);

// event.route.ts
router.get(
  '/get-reviews/:id',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getEventReviews,
);

// ── Visibility / Featured (public — token লাগবে না) ──────────────────────────
router.get(
  '/featured',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getFeaturedEvents,
);
router.get(
  '/top',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getTopEvents,
);
router.get(
  '/highlighted',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getHighlightedEvents,
);
router.get(
  '/pinned',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getPinnedEvents,
);

router.get(
  '/upcoming-events/:hostId',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getUpcomingEventsByHostcontroller,
);

//new review route
router.get(
  '/get-reviewsnew/:id',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getEventReviewsold,
);

router.get(
  '/host/:hostId',
  auth(USER_ROLE.USER, USER_ROLE.ORGANIZER),
  eventcontroller.getEventsByHost,
);

router.get(
  '/',
  auth(
    USER_ROLE.USER,
    USER_ROLE.ORGANIZER,
    USER_ROLE.admin,
    USER_ROLE.MARCHANT,
    USER_ROLE.KAATEDJ,
  ),
  eventcontroller.getAllEvents,
);

router.post(
  '/reply',
  auth(USER_ROLE.ORGANIZER),
  eventcontroller.addReplyToReview,
);

export const eventRoutes = router;
