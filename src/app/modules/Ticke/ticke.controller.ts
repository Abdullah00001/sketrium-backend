// ticket.controller.ts
import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { downloadTicketImage, getPlaceName, imageUrlToBase64, ticketService } from "./ticke.service";
import httpStatus  from 'http-status';
import { Ticket } from "./ticke.model";
import AppError from "../../error/AppError";
import config from "../../config";
import QRCode from "qrcode";
import { Event } from "../event/event.model";



const buyTicket = catchAsync(async (req: Request, res: Response) => {
  const { quantity = 1, ticketType = "General" } = req.body;
  const result = await ticketService.buyTicket(
    req.user._id,
    req.params.eventId as string,
    quantity,
    ticketType
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Ticket payment initiated",
    data: result,
  });
});


// ⚠️ Webhook — catchAsync use korbo na, raw body dorkar

// const ticketWebhook = async (req: Request, res: Response) => {
//   try {
//     const signature = req.headers["stripe-signature"] as string;
//     const result = await ticketService.handleTicketWebhook(
//       req.body,
//       signature
//     );
//     res.status(200).json(result);
//   } catch (error: any) {
//     res.status(400).json({ error: error.message });
//   }
// };


const getMyTickets = catchAsync(async (req: Request, res: Response) => {
  const result = await ticketService.getMyTickets(
    req.user._id,
    req.query.page ? Number(req.query.page) : 1,
    req.query.limit ? Number(req.query.limit) : 10
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Tickets fetched successfully",
    data: result,
  });
});


const getTicketDetails = catchAsync(async (req: Request, res: Response) => {
  const result = await ticketService.getTicketDetails(
    req.params.id as string,
    req.user._id
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Ticket details fetched",
    data: result,
  });
});


const getTicketQRCode = catchAsync(async (req: Request, res: Response) => {
  const result = await ticketService.getTicketQRCode(
    req.params.id as string,
    req.user._id
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "QR Code generated",
    data: result,
  });
});


// Entry scanner er jonno — admin/organizer use korbe
const scanTicket = catchAsync(async (req: Request, res: Response) => {
  const { ticketNumber } = req.body;
  const result = await ticketService.scanTicket(ticketNumber);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});



//new api add




// ── 1. Earning Overview ───────────────────────────────────────────────────────
// GET /api/v1/earnings/overview?year=2025
// const getEarningOverview = catchAsync(async (req: Request, res: Response) => {
//   const userId = req.user?._id;
//   const year = req.query.year ? parseInt(req.query.year as string) : undefined;
 
//   const result = await ticketService.getEarningOverview(userId, year);
 
//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "Earning overview fetched successfully",
//     data: result,
//   });
// });
 

// ── Controller ─────────────────────────────────────────────────────────────────
const getEarningOverview = catchAsync(async (req: Request, res: Response) => {
  const result = await ticketService.getEarningOverview(
    req.user?._id,
    req.query.year ? parseInt(req.query.year as string) : undefined,
    req.query.page ? Number(req.query.page) : 1,
    req.query.limit ? Number(req.query.limit) : 10,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Earning overview fetched successfully',
    data: result,
  });
});


// ── 2. My Events List (dropdown) ──────────────────────────────────────────────
// GET /api/v1/earnings/events
const getMyEventsList = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
 
  const result = await ticketService.getMyEventsList(userId);
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Events list fetched successfully",
    data: result,
  });
});
 
// ── 3. Earning by Event (analytics) ──────────────────────────────────────────
// GET /api/v1/earnings/by-event/:eventId
const getEarningByEvent = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const { eventId } = req.params;
 
  const result = await ticketService.getEarningByEvent(userId, eventId as string);
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Earning analytics fetched successfully",
    data: result,
  });
});






// GET /api/v1/tickets/:id/download/image
const downloadImage = catchAsync(async (req: Request, res: Response) => {
  const buffer = await ticketService.downloadTicketImage(req.params.id as string, req.user._id);
 
  res.set({
    "Content-Type": "image/png",
    "Content-Disposition": `attachment; filename="ticket-${req.params.id}.png"`,
    "Content-Length": buffer.length,
  });
 
  res.send(buffer);
});


















const paymentSuccess = catchAsync(async (req: Request, res: Response) => {
  const { ticketId } = req.query;

  if (!ticketId) {
    return res.send(renderErrorPage("Ticket ID missing"));
  }

  const ticket = await Ticket.findById(ticketId)
    .populate("event", "title date time location coverImage price")
    .populate("user", "fullName email image");

  if (!ticket) {
    return res.send(renderErrorPage("Ticket not found"));
  }

 // populate করার আগে id গুলো আলাদা রাখো
const eventId = ticket.event._id || ticket.event
const userId = ticket.user._id || ticket.user

console.log('eventId:', eventId)
console.log('userId:', userId)

const [t, e] = await Promise.all([
  Ticket.findByIdAndUpdate(ticketId, { paymentStatus: "paid" }),
  Event.findByIdAndUpdate(eventId, { $addToSet: { attendees: userId } }, { new: true }),
])

console.log('updated event attendees:', e?.attendees)

  const event = (ticket as any).event;
  const user = (ticket as any).user;

  const eventDate = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  // ── Place name ─────────────────────────────────────────
  let place = "TBA";
  if (event.location?.coordinates?.length === 2) {
    const lng = event.location.coordinates[0];
    const lat = event.location.coordinates[1];
    place = await getPlaceName(lat, lng);
  }

  // ── QR Code ────────────────────────────────────────────
  const qrDataURL = await QRCode.toDataURL(ticket.ticketNumber, {
    width: 160,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });

  // ── Cover Image ────────────────────────────────────────
  const coverBase64 = event.coverImage?.url
    ? await imageUrlToBase64(event.coverImage.url)
    : "";

  const coverImg = coverBase64
    ? `<img src="${coverBase64}" style="width:100%;height:200px;object-fit:cover;display:block;" />`
    : `<div style="width:100%;height:200px;background:linear-gradient(135deg,#6C63FF,#3B82F6);"></div>`;

  const avatarLetter = (user?.fullName || ticket.attendeeName || "G")
    .charAt(0)
    .toUpperCase();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Payment Successful</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    background: #0f0f1a;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .success-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 24px;
  }
  .check-circle {
    width: 72px; height: 72px;
    background: linear-gradient(135deg, #27ae60, #2ecc71);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 36px; color: #fff; font-weight: bold;
    box-shadow: 0 0 30px rgba(39,174,96,0.5);
    margin-bottom: 12px;
    animation: pop 0.4s ease;
  }
  @keyframes pop {
    0% { transform: scale(0); opacity: 0; }
    80% { transform: scale(1.1); }
    100% { transform: scale(1); opacity: 1; }
  }
  .success-title { color: #fff; font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .success-sub { color: #888; font-size: 13px; }
  .ticket {
    width: 100%; max-width: 420px;
    border-radius: 20px; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    background: #fff;
  }
  .card-body { padding: 20px; position: relative; background: #fff; }
  .notch-row {
    display: flex; justify-content: space-between; align-items: center;
    margin: 0 -20px 16px; position: relative;
  }
  .notch { width: 24px; height: 24px; background: #0f0f1a; border-radius: 50%; }
  .dashed-line { flex: 1; border-top: 2px dashed #ddd; margin: 0 8px; }
  .event-title {
    font-size: 20px; font-weight: 700; color: #12122a;
    text-align: center; line-height: 1.3; margin-bottom: 16px;
  }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
  .info-label { font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .info-val { font-size: 13px; color: #12122a; font-weight: 700; }
  .divider { border: none; border-top: 1.5px dashed #ddd; margin: 14px 0; }
  .holder-section { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: linear-gradient(135deg, #6C63FF, #3B82F6);
    color: #fff; font-size: 20px; font-weight: bold;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .holder-name { font-size: 14px; font-weight: 700; color: #12122a; }
  .holder-email { font-size: 11px; color: #888; margin-top: 2px; }
  .qr-section { text-align: center; padding: 8px 0; }
  .qr-section img { width: 140px; height: 140px; }
  .ticket-num { font-size: 10px; color: #aaa; letter-spacing: 2px; margin-top: 6px; }
  .btn-wrap { margin-top: 20px; display: flex; gap: 12px; width: 100%; max-width: 420px; }
  .btn { flex: 1; padding: 14px; border-radius: 12px; font-size: 14px; font-weight: 700; text-align: center; cursor: pointer; text-decoration: none; border: none; }
  .btn-primary { background: linear-gradient(135deg, #6C63FF, #3B82F6); color: #fff; }
  .btn-outline { background: transparent; border: 1.5px solid #333; color: #fff; }
</style>
</head>
<body>

  <div class="success-badge">
    <div class="check-circle">✓</div>
    <div class="success-title">Payment Successful!</div>
    <div class="success-sub">Your ticket is confirmed and ready</div>
  </div>

  <div class="ticket">
    ${coverImg}
    <div class="card-body">
      <div class="holder-section">
        <div class="avatar">${avatarLetter}</div>
        <div>
          <div class="holder-name">${user?.fullName || ticket.attendeeName || "Guest"}</div>
          <div class="holder-email">${user?.email || ticket.attendeeEmail}</div>
        </div>
      </div>
      <div class="notch-row">
        <div class="notch"></div>
        <div class="dashed-line"></div>
        <div class="notch"></div>
      </div>
      <div class="event-title">${event.title}</div>
      <div class="info-grid">
        <div>
          <div class="info-label">Date</div>
          <div class="info-val">${eventDate}</div>
        </div>
        <div>
          <div class="info-label">Time</div>
          <div class="info-val">${event.time || "TBA"}</div>
        </div>
        <div>
          <div class="info-label">Place</div>
          <div class="info-val">${place}</div>
        </div>
        <div>
          <div class="info-label">Quantity</div>
          <div class="info-val">${String(ticket.quantity).padStart(2, "0")} Person${ticket.quantity > 1 ? "s" : ""}</div>
        </div>
        <div>
          <div class="info-label">Ticket Type</div>
          <div class="info-val">${ticket.ticketType}</div>
        </div>
        <div>
          <div class="info-label">Amount Paid</div>
          <div class="info-val">$${ticket.totalAmount.toFixed(2)}</div>
        </div>
      </div>
      <hr class="divider" />
      <div class="qr-section">
        <img src="${qrDataURL}" alt="QR Code" />
        <div class="ticket-num">${ticket.ticketNumber}</div>
      </div>
    </div>
  </div>

  <div class="btn-wrap"></div>

</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});









// const paymentSuccess = catchAsync(async (req: Request, res: Response) => {
//   const { ticketId } = req.query;

//   if (!ticketId) {
//     return res.send(renderErrorPage("Ticket ID missing"));
//   }

//   const ticket = await Ticket.findById(ticketId)
//     .populate("event", "title date time location coverImage price")
//     .populate("user", "fullName email image");

//   if (!ticket) {
//     return res.send(renderErrorPage("Ticket not found"));
//   }

//   const event = (ticket as any).event;
//   const user = (ticket as any).user;

//   const eventDate = new Date(event.date).toLocaleDateString("en-US", {
//     weekday: "long",
//     month: "long",
//     day: "2-digit",
//     year: "numeric",
//   });

//   // ── Place name ─────────────────────────────────────────
//   let place = "TBA";
//   if (event.location?.coordinates?.length === 2) {
//     const lng = event.location.coordinates[0];
//     const lat = event.location.coordinates[1];
//     place = await getPlaceName(lat, lng);
//   }

//   // ── QR Code ────────────────────────────────────────────
//   const qrDataURL = await QRCode.toDataURL(ticket.ticketNumber, {
//     width: 160,
//     margin: 1,
//     color: { dark: "#000000", light: "#ffffff" },
//   });

//   // ── Cover Image ────────────────────────────────────────
//   const coverBase64 = event.coverImage?.url
//     ? await imageUrlToBase64(event.coverImage.url)
//     : "";

//   const coverImg = coverBase64
//     ? `<img src="${coverBase64}" style="width:100%;height:200px;object-fit:cover;display:block;" />`
//     : `<div style="width:100%;height:200px;background:linear-gradient(135deg,#6C63FF,#3B82F6);"></div>`;

//   const avatarLetter = (user?.fullName || ticket.attendeeName || "G")
//     .charAt(0)
//     .toUpperCase();

//   const html = `<!DOCTYPE html>
// <html lang="en">
// <head>
// <meta charset="UTF-8"/>
// <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
// <title>Payment Successful</title>
// <style>
//   * { margin: 0; padding: 0; box-sizing: border-box; }
//   body {
//     font-family: Arial, sans-serif;
//     background: #0f0f1a;
//     min-height: 100vh;
//     display: flex;
//     flex-direction: column;
//     align-items: center;
//     justify-content: center;
//     padding: 24px;
//   }

//   /* ── Success Badge ── */
//   .success-badge {
//     display: flex;
//     flex-direction: column;
//     align-items: center;
//     margin-bottom: 24px;
//   }
//   .check-circle {
//     width: 72px; height: 72px;
//     background: linear-gradient(135deg, #27ae60, #2ecc71);
//     border-radius: 50%;
//     display: flex; align-items: center; justify-content: center;
//     font-size: 36px; color: #fff; font-weight: bold;
//     box-shadow: 0 0 30px rgba(39,174,96,0.5);
//     margin-bottom: 12px;
//     animation: pop 0.4s ease;
//   }
//   @keyframes pop {
//     0% { transform: scale(0); opacity: 0; }
//     80% { transform: scale(1.1); }
//     100% { transform: scale(1); opacity: 1; }
//   }
//   .success-title {
//     color: #fff;
//     font-size: 22px;
//     font-weight: 700;
//     margin-bottom: 4px;
//   }
//   .success-sub {
//     color: #888;
//     font-size: 13px;
//   }

//   /* ── Ticket Card ── */
//   .ticket {
//     width: 100%;
//     max-width: 420px;
//     border-radius: 20px;
//     overflow: hidden;
//     box-shadow: 0 20px 60px rgba(0,0,0,0.6);
//     background: #fff;
//   }
//   .card-body {
//     padding: 20px;
//     position: relative;
//     background: #fff;
//   }
//   .notch-row {
//     display: flex;
//     justify-content: space-between;
//     align-items: center;
//     margin: 0 -20px 16px;
//     position: relative;
//   }
//   .notch {
//     width: 24px; height: 24px;
//     background: #0f0f1a;
//     border-radius: 50%;
//   }
//   .dashed-line {
//     flex: 1;
//     border-top: 2px dashed #ddd;
//     margin: 0 8px;
//   }
//   .event-title {
//     font-size: 20px;
//     font-weight: 700;
//     color: #12122a;
//     text-align: center;
//     line-height: 1.3;
//     margin-bottom: 16px;
//   }
//   .info-grid {
//     display: grid;
//     grid-template-columns: 1fr 1fr;
//     gap: 14px;
//     margin-bottom: 16px;
//   }
//   .info-label {
//     font-size: 10px;
//     color: #aaa;
//     text-transform: uppercase;
//     letter-spacing: 0.5px;
//     margin-bottom: 3px;
//   }
//   .info-val {
//     font-size: 13px;
//     color: #12122a;
//     font-weight: 700;
//   }
//   .divider {
//     border: none;
//     border-top: 1.5px dashed #ddd;
//     margin: 14px 0;
//   }

//   /* ── Holder ── */
//   .holder-section {
//     display: flex;
//     align-items: center;
//     gap: 12px;
//     margin-bottom: 14px;
//   }
//   .avatar {
//     width: 44px; height: 44px;
//     border-radius: 50%;
//     background: linear-gradient(135deg, #6C63FF, #3B82F6);
//     color: #fff;
//     font-size: 20px;
//     font-weight: bold;
//     display: flex; align-items: center; justify-content: center;
//     flex-shrink: 0;
//   }
//   .holder-name { font-size: 14px; font-weight: 700; color: #12122a; }
//   .holder-email { font-size: 11px; color: #888; margin-top: 2px; }

//   /* ── QR ── */
//   .qr-section {
//     text-align: center;
//     padding: 8px 0;
//   }
//   .qr-section img { width: 140px; height: 140px; }
//   .ticket-num {
//     font-size: 10px;
//     color: #aaa;
//     letter-spacing: 2px;
//     margin-top: 6px;
//   }

//   /* ── Amount Badge ── */
//   .amount-badge {
//     display: inline-block;
//     background: linear-gradient(135deg, #6C63FF, #3B82F6);
//     color: #fff;
//     font-size: 13px;
//     font-weight: 700;
//     padding: 6px 16px;
//     border-radius: 20px;
//     margin-top: 8px;
//   }

//   /* ── Download Button ── */
//   .btn-wrap {
//     margin-top: 20px;
//     display: flex;
//     gap: 12px;
//     width: 100%;
//     max-width: 420px;
//   }
//   .btn {
//     flex: 1;
//     padding: 14px;
//     border-radius: 12px;
//     font-size: 14px;
//     font-weight: 700;
//     text-align: center;
//     cursor: pointer;
//     text-decoration: none;
//     border: none;
//   }
//   .btn-primary {
//     background: linear-gradient(135deg, #6C63FF, #3B82F6);
//     color: #fff;
//   }
//   .btn-outline {
//     background: transparent;
//     border: 1.5px solid #333;
//     color: #fff;
//   }
// </style>
// </head>
// <body>

//   <!-- Success Badge -->
//   <div class="success-badge">
//     <div class="check-circle">✓</div>
//     <div class="success-title">Payment Successful!</div>
//     <div class="success-sub">Your ticket is confirmed and ready</div>
//   </div>

//   <!-- Ticket -->
//   <div class="ticket">
//     ${coverImg}
//     <div class="card-body">

//       <!-- Holder -->
//       <div class="holder-section">
//         <div class="avatar">${avatarLetter}</div>
//         <div>
//           <div class="holder-name">${user?.fullName || ticket.attendeeName || "Guest"}</div>
//           <div class="holder-email">${user?.email || ticket.attendeeEmail}</div>
//         </div>
//       </div>

//       <!-- Notch divider -->
//       <div class="notch-row">
//         <div class="notch"></div>
//         <div class="dashed-line"></div>
//         <div class="notch"></div>
//       </div>

//       <!-- Event Title -->
//       <div class="event-title">${event.title}</div>

//       <!-- Info Grid -->
//       <div class="info-grid">
//         <div>
//           <div class="info-label">Date</div>
//           <div class="info-val">${eventDate}</div>
//         </div>
//         <div>
//           <div class="info-label">Time</div>
//           <div class="info-val">${event.time || "TBA"}</div>
//         </div>
//         <div>
//           <div class="info-label">Place</div>
//           <div class="info-val">${place}</div>
//         </div>
//         <div>
//           <div class="info-label">Quantity</div>
//           <div class="info-val">${String(ticket.quantity).padStart(2, "0")} Person${ticket.quantity > 1 ? "s" : ""}</div>
//         </div>
//         <div>
//           <div class="info-label">Ticket Type</div>
//           <div class="info-val">${ticket.ticketType}</div>
//         </div>
//         <div>
//           <div class="info-label">Amount Paid</div>
//           <div class="info-val">$${ticket.totalAmount.toFixed(2)}</div>
//         </div>
//       </div>

//       <hr class="divider" />

//       <!-- QR Code -->
//       <div class="qr-section">
//         <img src="${qrDataURL}" alt="QR Code" />
//         <div class="ticket-num">${ticket.ticketNumber}</div>
//       </div>

//     </div>
//   </div>

//   <!-- Buttons -->
//   <div class="btn-wrap">
    
//   </div>

// </body>
// </html>`;

//   res.setHeader("Content-Type", "text/html");
//   res.send(html);
// });

// ── Error Page ─────────────────────────────────────────────
const renderErrorPage = (message: string) => `
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body style="background:#0f0f1a;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:12px;">
  <div style="font-size:48px;">❌</div>
  <div style="font-size:20px;font-weight:700;">Something went wrong</div>
  <div style="color:#888;font-size:14px;">${message}</div>
</body>
</html>`;

// ── Payment Cancel ─────────────────────────────────────────
const paymentCancel = catchAsync(async (req: Request, res: Response) => {
  const { ticketId } = req.query;

  if (ticketId) {
    await Ticket.findByIdAndUpdate(ticketId, {
      paymentStatus: "canceled",
    });
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Payment Cancelled</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    background: #0f0f1a;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .icon { font-size: 64px; }
  .title { color: #fff; font-size: 22px; font-weight: 700; }
  .sub { color: #888; font-size: 14px; }
  .btn {
    margin-top: 16px;
    padding: 12px 28px;
    background: linear-gradient(135deg, #6C63FF, #3B82F6);
    color: #fff;
    border-radius: 12px;
    text-decoration: none;
    font-weight: 700;
    font-size: 14px;
  }
</style>
</head>
<body>
  <div class="icon">❌</div>
  <div class="title">Payment Cancelled</div>
  <div class="sub">Your ticket has been cancelled. No charge was made.</div>
  <a href="${config.frontend_url}" class="btn">Go Home</a>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});


const stripeWebhookHandler = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;
  const rawBody = req.body; 

  if (!signature) {
    return res.status(httpStatus.BAD_REQUEST).send('Missing stripe signature');
  }


  const result = await ticketService.confirmTicketPayment(rawBody, signature);

  res.status(httpStatus.OK).json(result);
});


export const ticketController = {
  buyTicket,
//   ticketWebhook,
  getMyTickets,
  getTicketDetails,
  getTicketQRCode,
  scanTicket,
  // New APIs
  getEarningOverview,
  getMyEventsList,
  getEarningByEvent,
  downloadImage,
   paymentSuccess,
  paymentCancel,
  stripeWebhookHandler,
};