// ticket.interface.ts
import { Types } from "mongoose";
 
export interface ITicket {
  user: Types.ObjectId;
  event: Types.ObjectId;
  ticketNumber: string;       // unique ticket ID — QR code e thakbe
  attendeeName: string;
  attendeeEmail: string;
  ticketType: string;         // "General" | "VIP" | "VVIP"
  quantity: number;
  price: number;              // price snapshot
  totalAmount: number;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  isUsed: boolean;            // QR scan hoile true hobe
  stripePaymentIntentId: string;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
 