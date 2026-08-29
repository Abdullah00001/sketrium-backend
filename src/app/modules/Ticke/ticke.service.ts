// ticket.service.ts
import Stripe from "stripe";
import QRCode from "qrcode";

import { Event } from "../event/event.model";
import User from "../user/user.model";
import { Ticket } from "./ticke.model";
import config from "../../config";
import mongoose from "mongoose";
import catchAsync from "../../utils/catchAsync";

import { Request, Response } from "express";
import AppError from "../../error/AppError";
import puppeteer from "puppeteer";
import httpStatus  from 'http-status';



const stripe = new Stripe(config.stripe.stripe_secret_key as string)
// ─── Unique ticket number generate ────────────────────────────────────────
const generateTicketNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TKT-${timestamp}-${random}`;
};




// ─── 2. Stripe Webhook — payment confirm hoile ticket activate ────────────



// const handleTicketWebhook = async (rawBody: Buffer, signature: string) => {
//   let event: Stripe.Event;

//   try {
//     event = stripe.webhooks.constructEvent(
//       rawBody,
//       signature,
//       process.env.STRIPE_WEBHOOK_SECRET as string
//     );
//   } catch {
//     throw new Error("Webhook signature verification failed");
//   }

//   if (event.type === "payment_intent.succeeded") {
//     const paymentIntent = event.data.object as Stripe.PaymentIntent;

//     // Ticket status paid koro + event attendees e user add koro
//     const ticket = await Ticket.findOneAndUpdate(
//       { stripePaymentIntentId: paymentIntent.id },
//       { paymentStatus: "paid" },
//       { new: true }
//     );

//     if (ticket) {
//       // Event attendees list e user add koro
//       await Event.findByIdAndUpdate(ticket.event, {
//         $addToSet: { attendees: ticket.user },
//       });
//     }
//   }

//   if (event.type === "payment_intent.payment_failed") {
//     const paymentIntent = event.data.object as Stripe.PaymentIntent;
//     await Ticket.findOneAndUpdate(
//       { stripePaymentIntentId: paymentIntent.id },
//       { paymentStatus: "failed" }
//     );
//   }

//   return { received: true };
// };







// ─── 3. My Tickets — user er sob tickets ──────────────────────────────────
const getMyTickets = async (userId: string, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const total = await Ticket.countDocuments({
    user: userId,
    isDeleted: false,
    paymentStatus: "paid",
  });

  const tickets = await Ticket.find({ user: userId, paymentStatus: "paid" })
    .populate("event", "title date time location coverImage category")
    .populate("user", "fullName email image") 
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    tickets,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ─── 4. Ticket Details ────────────────────────────────────────────────────
const getTicketDetails = async (ticketId: string, userId: string) => {
  const ticket = await Ticket.findOne({
    _id: ticketId,
    user: userId,
  }).populate("event", "title date time location coverImage description host").populate("user", "fullName email image") ;

  if (!ticket) throw new Error("Ticket not found");
  return ticket;
};

// ─── 5. QR Code generate ──────────────────────────────────────────────────
const getTicketQRCode = async (ticketId: string, userId: string) => {
  const ticket = await Ticket.findOne({
    _id: ticketId,
    user: userId,
    paymentStatus: "paid",
  }).populate("event", "title date location");

  if (!ticket) throw new Error("Ticket not found or payment pending");

  // QR code e ticket info encode korbo
  const qrData = JSON.stringify({
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket._id,
    event: (ticket.event as any).title,
    attendee: ticket.attendeeName,
    date: (ticket.event as any).date,
  });

  // Base64 QR image generate
  const qrCodeBase64 = await QRCode.toDataURL(qrData, {
    width: 300,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  return {
    ticketNumber: ticket.ticketNumber,
    attendeeName: ticket.attendeeName,
    attendeeEmail: ticket.attendeeEmail,
    ticketType: ticket.ticketType,
    quantity: ticket.quantity,
    isUsed: ticket.isUsed,
    qrCode: qrCodeBase64, // frontend e <Image source={{ uri: qrCode }} />
    event: ticket.event,
  };
};

// ─── 6. Scan QR — entry te use korle isUsed true hobe ────────────────────
const scanTicket = async (ticketNumber: string) => {
  const ticket = await Ticket.findOne({
    ticketNumber,
    paymentStatus: "paid",
  }).populate("event", "title date location");

  if (!ticket) throw new Error("Invalid ticket");
  if (ticket.isUsed) throw new Error("Ticket already used");

  ticket.isUsed = true;
  await ticket.save();

  return {
    valid: true,
    message: "Ticket scanned successfully",
    attendeeName: ticket.attendeeName,
    ticketType: ticket.ticketType,
    event: ticket.event,
  };
};






// ─── Unique ticket number generate ────────────────────────────────────────

// const generateTicketNumber = (): string => {
//   const timestamp = Date.now().toString(36).toUpperCase();
//   const random = Math.random().toString(36).substring(2, 6).toUpperCase();
//   return `TKT-${timestamp}-${random}`;
// };

// ─── 1. Buy Ticket — Stripe Checkout Session create ───────────────────────












//confrem hridoy 




// const buyTicket = async (
//   userId: string,
//   eventId: string,
//   quantity: number = 1,
//   ticketType: string = "General"
// ) => {
//   if (quantity < 1 || quantity > 10) {
//     throw new Error("Quantity must be between 1 and 10");
//   }

//   const user = await User.findById(userId);
//   if (!user) throw new Error("User not found");

//   const event = await Event.findById(eventId);
//   if (!event) throw new Error("Event not found");
//   if (event.isPast) throw new Error("This event has already passed");

//   const pricePerTicket = event.price || 0;
//   const totalAmount = pricePerTicket * quantity;

//   // ✅ Free event হলে সরাসরি ticket দিয়ে দিন
//   if (pricePerTicket === 0) {
//     const ticket = await Ticket.create({
//       user: userId,
//       event: eventId,
//       ticketNumber: generateTicketNumber(),
//       attendeeName: user.fullName,
//       attendeeEmail: user.email,
//       ticketType,
//       quantity,
//       price: 0,
//       totalAmount: 0,
//       paymentStatus: "paid", // ✅ সরাসরি paid
//     });

//     // ✅ attendees এ add করুন
//     await Event.findByIdAndUpdate(eventId, {
//       $addToSet: { attendees: userId },
//     });

//     return {
//       ticketId: ticket._id,
//       ticketNumber: ticket.ticketNumber,
//       quantity,
//       pricePerTicket: 0,
//       totalAmount: 0,
//       checkoutUrl: null, // ✅ free তে checkout নেই
//       isFree: true,
//       event: {
//         title: event.title,
//         date: event.date,
//         time: event.time,
//         location: event.location,
//       },
//     };
//   }

//   // ✅ Paid event হলে Stripe এ যাবে
//   const ticket = await Ticket.create({
//     user: userId,
//     event: eventId,
//     ticketNumber: generateTicketNumber(),
//     attendeeName: user.fullName,
//     attendeeEmail: user.email,
//     ticketType,
//     quantity,
//     price: pricePerTicket,
//     totalAmount,
//     paymentStatus: "pending", // ✅ pending
//   });

//   const session = await stripe.checkout.sessions.create({
//     payment_method_types: ["card"],
//     mode: "payment",
//     customer_email: user.email,
//     line_items: [
//       {
//         quantity,
//         price_data: {
//           currency: "usd",
//           unit_amount: Math.round(pricePerTicket * 100),
//           product_data: {
//             name: `${event.title} — ${ticketType} Ticket`,
//             description: `Quantity: ${quantity} | Date: ${new Date(event.date).toDateString()}`,
//           },
//         },
//       },
//     ],
//     metadata: {
//       ticketId: ticket._id.toString(),
//       userId: userId.toString(),
//       eventId: eventId.toString(),
//       quantity: quantity.toString(),
//     },
//    success_url: `${config.backend_url}/tickets/success?ticketId=${ticket._id}`,
//     cancel_url: `${config.backend_url}/tickets/cancel?ticketId=${ticket._id}`,
//   });

//   await Ticket.findByIdAndUpdate(ticket._id, {
//     stripePaymentIntentId: session.id,
//   });

//   return {
//     ticketId: ticket._id,
//     ticketNumber: ticket.ticketNumber,
//     quantity,
//     pricePerTicket,
//     totalAmount,
//     checkoutUrl: session.url, // ✅ paid এ checkout url আসবে
//     isFree: false,
//     success_url: `${config.backend_url}/tickets/success?ticketId=${ticket._id}`,
//     event: {
//       title: event.title,
//       date: event.date,
//       time: event.time,
//       location: event.location,
//     },
//   };
// };


const buyTicket = async (
  userId: string,
  eventId: string,
  quantity: number = 1,
  ticketType: string = "General"
) => {
  const parsedQuantity = Number(quantity);
  if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10) {
    throw new Error("Quantity must be between 1 and 10");
  }



  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");
  if (event.isPast) throw new Error("This event has already passed");




  const pricePerTicket = event.price || 0;
  const totalAmount = pricePerTicket * quantity;

 const currencyCode = event.currency ? event.currency.toLowerCase() : 'usd';

  // ✅ Free event
  if (pricePerTicket === 0) {
    const ticket = await Ticket.create({
      user: userId,
      event: eventId,
      ticketNumber: generateTicketNumber(),
      attendeeName: user.fullName,
      attendeeEmail: user.email,
      ticketType,
      quantity: parsedQuantity,
      price: 0,
      totalAmount: 0,
      paymentStatus: "paid",
    });

    await Event.findByIdAndUpdate(eventId, {
      $addToSet: { attendees: userId },
    });

    return {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      quantity,
      pricePerTicket: 0,
      totalAmount: 0,
      isFree: true,
      checkoutUrl: null,
      successUrl: `${config.backend_url}/tickets/success?ticketId=${ticket._id}`, // ✅ add
      event: {
        title: event.title,
        date: event.daySchedules?.[0]?.date || event.endDate,
        location: event.location,
      },
    };
  }

  // ✅ Paid event
  const ticket = await Ticket.create({
    user: userId,
    event: eventId,
    ticketNumber: generateTicketNumber(),
    attendeeName: user.fullName,
    attendeeEmail: user.email,
    ticketType,
    quantity: parsedQuantity,
    price: pricePerTicket,
    totalAmount,
    paymentStatus: "pending",
  });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        quantity: parsedQuantity,
        price_data: {
          currency: currencyCode,
          unit_amount: Math.round(pricePerTicket * 100),
          product_data: {
            name: `${event.title || 'Event'} — ${ticketType} Ticket`,
            description: `Quantity: ${parsedQuantity} | Date: ${
              event.daySchedules?.[0]?.date
                ? new Date(event.daySchedules[0].date).toDateString()
                : (event.endDate ? new Date(event.endDate).toDateString() : 'TBD')
            }`,
          },
        },
      },
    ],
    metadata: {
      ticketId: ticket._id.toString(),
      userId: userId.toString(),
      eventId: eventId.toString(),
      quantity: parsedQuantity.toString(),
    },
    success_url: `${config.backend_url}/tickets/success?ticketId=${ticket._id}`,
    cancel_url: `${config.backend_url}/tickets/cancel?ticketId=${ticket._id}`,
  });



  await Ticket.findByIdAndUpdate(ticket._id, {
    stripePaymentIntentId: session.id,
  });


await Event.findByIdAndUpdate(eventId, {
      $addToSet: { attendees: userId },
     });


  return {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    quantity,
    pricePerTicket,
    currency: event.currency,
    totalAmount,
    isFree: false,
    checkoutUrl: session.url,
    successUrl: null,
    event: {
      title: event.title,
      date: event.daySchedules?.[0]?.date || event.endDate,
      location: event.location,
    },
  };
};





// ─── 2. Stripe Webhook — payment success hole ticket confirm koro ──────────


const confirmTicketPayment = async (rawBody: Buffer, signature: string) => {
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.stripe.stripe_webhook_secret as string,
    );
  } catch {
    throw new Error('Webhook signature verification failed');
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as any;

    const ticketId = session.metadata?.ticketId;
    if (!ticketId) throw new Error('Ticket ID not found in metadata');

    // Ticket status update koro
    await Ticket.findByIdAndUpdate(ticketId, {
      paymentStatus: 'completed',
      stripeSessionId: session.id,
    });

    // Event attendees e user add koro (tomar event model e thakle)
    const ticket = await Ticket.findById(ticketId);
    if (ticket) {
      await Event.findByIdAndUpdate(ticket.event,{
        $addToSet: { attendees: ticket.user },
      });
    }
  }

  // Payment fail hole
  if (stripeEvent.type === 'checkout.session.expired') {

   const session = stripeEvent.data.object as any;
    const ticketId = session.metadata?.ticketId;

    if (ticketId) {
      await Ticket.findByIdAndUpdate(ticketId, {
        paymentStatus: 'failed',
      });
    }
  }

  return { received: true };
};



//new api routes









const getEarningOverview = async (
  userId: string,
  year?: number,
  page = 1,       // ← add
  limit = 10,     // ← add
) => {
  const targetYear = year || new Date().getFullYear();
  const skip = (page - 1) * limit;

  const myEvents = await Event.find(
    { host: userId, isDeleted: { $ne: true } },
    { _id: 1, attendees: 1 },
  );
  const eventIds = myEvents.map((e) => e._id);

  const totalEvents = myEvents.length;

  const totalAttendees = myEvents.reduce(
    (sum, event: any) => sum + (event.attendees?.length || 0),
    0,
  );

  const totals = await Ticket.aggregate([
    {
      $match: {
        event: { $in: eventIds },
        paymentStatus: 'paid',
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        totalEarning: { $sum: '$totalAmount' },
        ticketsSold: { $sum: '$quantity' },
      },
    },
  ]);

  const monthlyRaw = await Ticket.aggregate([
    {
      $match: {
        event: { $in: eventIds },
        paymentStatus: 'paid',
        isDeleted: false,
        createdAt: {
          $gte: new Date(`${targetYear}-01-01T00:00:00.000Z`),
          $lte: new Date(`${targetYear}-12-31T23:59:59.999Z`),
        },
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        earning: { $sum: '$totalAmount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const monthlyEarning = Array.from({ length: 12 }, (_, i) => {
    const found = monthlyRaw.find((m: any) => m._id === i + 1);
    return {
      month: i + 1,
      monthName: new Date(targetYear, i, 1).toLocaleString('en', {
        month: 'short',
      }),
      earning: found?.earning || 0,
    };
  });

  // ── Recent Payments with pagination ───────────────────────────
  const totalPayments = await Ticket.countDocuments({
    event: { $in: eventIds },
    paymentStatus: 'paid',
    isDeleted: false,
  });

  const recentPayments = await Ticket.find({
    event: { $in: eventIds },
    paymentStatus: 'paid',
    isDeleted: false,
  })
    .populate('user', 'fullName image email')
    .populate('event', 'title coverImage date')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    totalEarning: totals[0]?.totalEarning || 0,
    ticketsSold: totals[0]?.ticketsSold || 0,
    totalEvents,
    totalAttendees,
    monthlyEarning,
    recentPayments: {
      data: recentPayments,
      pagination: {
        total: totalPayments,
        page,
        limit,
        totalPages: Math.ceil(totalPayments / limit),
      },
    },
  };
};





const getMyEventsList = async (userId: string) => {
  const events = await Event.find(
    { host: userId, isDeleted: false },
    { title: 1, date: 1 }
  ).sort({ date: -1 });
 
  return events;
};
 

const getEarningByEvent = async (userId: string, eventId: string) => {
  // Verify this event belongs to this organizer
  const event = await Event.findOne({
    _id: eventId,
    host: userId,
    isDeleted: false,
  });
  if (!event) throw new Error("Event not found");
 
  const payments = await Ticket.find({
    event: eventId,
    paymentStatus: "paid",
    isDeleted: false,
  })
    .populate("user", "name profileImage")
    .sort({ createdAt: -1 })
    .select("totalAmount quantity ticketType createdAt user attendeeName attendeeEmail");
 
  // Event summary
  const summary = await Ticket.aggregate([
    {
      $match: {
        event: new mongoose.Types.ObjectId(eventId),
        paymentStatus: "paid",
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        totalEarning: { $sum: "$totalAmount" },
        ticketsSold: { $sum: "$quantity" },
      },
    },
  ]);
 
  return {
    event: {
      _id: event._id,
      title: event.title,
      date: event.date,
    },
    totalEarning: summary[0]?.totalEarning || 0,
    ticketsSold: summary[0]?.ticketsSold || 0,
    payments,
  };
};





// ── External image → base64 (timeout fix) ────────────────────────────────────
 export const imageUrlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return "";
  }
};
 

 export const getPlaceName = async (lat: number, lng: number): Promise<string> => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`;  // ✅ accept-language=en add করুন
    const res = await fetch(url, {
      headers: { 
        "User-Agent": "your-app-name/1.0",
        "Accept-Language": "en",  // ✅ এটাও add করুন
      },
    });
    const data = await res.json();
    
    const address = data.address;
    const place =
      address?.city ||
      address?.town ||
      address?.village ||
      address?.county ||
      address?.country ||
      "TBA";
    
    return place;
  } catch {
    return "TBA";
  }
};

// ── Download Ticket ────────────────────────────────────────
export const downloadTicketImage = async (
  ticketId: string,
  userId: string
): Promise<Buffer> => {
  const ticket = await Ticket.findOne({ _id: ticketId, user: userId })
    .populate("event", "title date time location coverImage")
    .populate("user", "fullName email");  // ✅ name → fullName

  if (!ticket) throw new AppError(httpStatus.NOT_FOUND, "Ticket not found");

  const event = (ticket as any).event;
  const user = (ticket as any).user;

  const qrDataURL = await QRCode.toDataURL(ticket.ticketNumber, {
    width: 180,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const eventDate = new Date(event.date).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  // ✅ coordinates থেকে real place name আনুন
  let place = "TBA";
  if (event.location?.coordinates?.length === 2) {
    const lng = event.location.coordinates[0];
    const lat = event.location.coordinates[1];
    place = await getPlaceName(lat, lng); // ✅ real name
  }

  const avatarLetter = (user?.fullName || ticket.attendeeName || "G")
    .charAt(0)
    .toUpperCase();

  const coverBase64 = event.coverImage?.url
    ? await imageUrlToBase64(event.coverImage.url)
    : "";

  const coverImg = coverBase64
    ? `<img src="${coverBase64}" style="width:100%;height:150px;object-fit:cover;display:block;" />`
    : `<div style="width:100%;height:150px;background:linear-gradient(135deg,#c0392b,#8e44ad);"></div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,sans-serif;background:#12122a;padding:24px;width:400px;}
  .banner{background:#0f2b0f;border:1px solid #1e5c1e;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:14px;}
  .check{width:34px;height:34px;background:#27ae60;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:bold;flex-shrink:0;}
  .banner-title{color:#27ae60;font-size:14px;font-weight:700;}
  .banner-sub{color:#777;font-size:11px;margin-top:2px;}
  .holder{background:#1a1a3a;border-radius:12px;padding:14px 16px;margin-bottom:14px;}
  .holder-label{color:#777;font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;}
  .holder-row{display:flex;align-items:center;gap:12px;}
  .avatar{width:42px;height:42px;border-radius:50%;background:#c0392b;color:#fff;font-size:18px;font-weight:bold;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .holder-name{color:#fff;font-size:14px;font-weight:600;}
  .holder-email{color:#888;font-size:11px;margin-top:2px;}
  .meta{display:flex;gap:28px;margin-top:12px;}
  .meta-label{color:#777;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}
  .meta-val{color:#fff;font-size:13px;font-weight:600;}
  .card{border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.5);}
  .card-body{background:#fff;padding:20px;position:relative;}
  .notch-l,.notch-r{position:absolute;top:-14px;width:28px;height:28px;background:#12122a;border-radius:50%;}
  .notch-l{left:-14px;}
  .notch-r{right:-14px;}
  .event-title{font-size:19px;font-weight:700;color:#12122a;text-align:center;line-height:1.3;margin-bottom:16px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;}
  .g-label{font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}
  .g-val{font-size:13px;color:#12122a;font-weight:700;}
  .dashed{border:none;border-top:1.5px dashed #ddd;margin:14px 0;}
  .qr-wrap{text-align:center;padding:4px 0 8px;}
  .qr-wrap img{width:160px;height:160px;}
  .ticket-num{font-size:10px;color:#aaa;letter-spacing:2px;margin-top:6px;}
</style>
</head>
<body>
  <div class="banner">
    <div class="check">✓</div>
    <div>
      <div class="banner-title">Ticket Confirmed</div>
      <div class="banner-sub">Ready to scan at entrance</div>
    </div>
  </div>
  <div class="holder">
    <div class="holder-label">Ticket Holder</div>
    <div class="holder-row">
      <div class="avatar">${avatarLetter}</div>
      <div>
        <div class="holder-name">${user?.fullName || ticket.attendeeName || "Guest"}</div>
        <div class="holder-email">${user?.email || ticket.attendeeEmail}</div>
      </div>
    </div>
    <div class="meta">
      <div>
        <div class="meta-label">Ticket Type</div>
        <div class="meta-val">${ticket.ticketType} Access</div>
      </div>
      <div>
        <div class="meta-label">Attendees</div>
        <div class="meta-val">${ticket.quantity} Person${ticket.quantity > 1 ? "s" : ""}</div>
      </div>
    </div>
  </div>
  <div class="card">
    ${coverImg}
    <div class="card-body">
      <div class="notch-l"></div>
      <div class="notch-r"></div>
      <div class="event-title">${event.title}</div>
      <div class="grid">
        <div><div class="g-label">Date</div><div class="g-val">${eventDate}</div></div>
        <div><div class="g-label">Time</div><div class="g-val">${event.time || "TBA"}</div></div>
        <div><div class="g-label">Place</div><div class="g-val">${place}</div></div>
        <div><div class="g-label">Quantity</div><div class="g-val">${String(ticket.quantity).padStart(2, "0")}</div></div>
      </div>
      <hr class="dashed" />
      <div class="qr-wrap">
        <img src="${qrDataURL}" alt="QR" />
        <div class="ticket-num">${ticket.ticketNumber}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 448, height: 900, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 448, height: bodyHeight, deviceScaleFactor: 2 });
    const buffer = await page.screenshot({ type: "png", fullPage: true });
    return buffer as Buffer;
  } finally {
    await browser.close();
  }
};


export const ticketService = {
  buyTicket,
//   handleTicketWebhook,
  getMyTickets,
  getTicketDetails,
  getTicketQRCode,
  scanTicket,
 confirmTicketPayment,
  // New APIs
  getEarningOverview,
  getMyEventsList,
  getEarningByEvent,
  downloadTicketImage,
};