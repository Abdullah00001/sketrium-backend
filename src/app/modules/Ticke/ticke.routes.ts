

// ticket.routes.ts
import { Router } from "express";

import { USER_ROLE } from "../user/user.constant";

import { ticketController } from "./ticke.controller";
import auth from "../../middleware/auth.middleware";
import express  from 'express';

 
const router = Router();
 
// ⚠️ Webhook MUST be first — raw body lagbe

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }), 
  ticketController.stripeWebhookHandler
);
// POST  /tickets/buy/:eventId     — event er ticket kino + clientSecret return
// body: { quantity: 1, ticketType: "General" | "VIP" | "VVIP" }

//done
router.post("/buy/:eventId", auth(USER_ROLE.USER), ticketController.buyTicket);
 
// GET   /tickets/my-tickets       — My Tickets screen
router.get("/my-tickets", auth(USER_ROLE.USER), ticketController.getMyTickets);
 
// GET   /tickets/:id              — single ticket details
router.get("/ticket-details/:id", auth(USER_ROLE.USER), ticketController.getTicketDetails);
 
// GET   /tickets/:id/qr           — QR Code screen

router.get("/ticket-qr/:id", auth(USER_ROLE.USER), ticketController.getTicketQRCode);
 
// POST  /tickets/scan             — entry scanner (organizer use korbe)
// body: { ticketNumber: "TKT-xxx-xxx", eventId: "..." }
router.post("/scan", auth(USER_ROLE.ORGANIZER), ticketController.scanTicket);







// New APIs for Organizer Dashboard


/**
 * GET /api/v1/earnings/overview
 * GET /api/v1/earnings/overview?year=2025
 * ─ Screen 1: Earning Overview
 * ─ Total Earning, Tickets Sold, Monthly Chart, Recent Payments
 */
router.get(
  "/overview",
  auth(USER_ROLE.ORGANIZER),
  ticketController.getEarningOverview
);
 
/**
 * GET /api/v1/earnings/events
 * ─ Screen 2: Event dropdown list
 */
router.get(
  "/getMyEventsList",
  auth(USER_ROLE.ORGANIZER),
  ticketController.getMyEventsList
);
 
/**
 * GET /api/v1/earnings/by-event/:eventId
 * ─ Screen 2: Earning Analytics — নির্দিষ্ট event এর সব payments
 */
router.get(
  "/by-event/:eventId",
  auth(USER_ROLE.ORGANIZER),
  ticketController.getEarningByEvent
);
 







router.get(
  "/download/:id",
  auth(USER_ROLE.USER),
  ticketController.downloadImage
);




router.get("/success", ticketController.paymentSuccess);
router.get("/cancel", ticketController.paymentCancel);
 
export const ticketRoutes = router;