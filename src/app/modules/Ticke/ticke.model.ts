


// ticket.model.ts
import { model, Schema } from "mongoose";
import { ITicket } from "./ticke.interface";

 
const ticketSchema = new Schema<ITicket>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
    },
    attendeeName: {
      type: String,
      // required: true,
    },
    attendeeEmail: {
      type: String,
      required: true,
    },
    ticketType: {
      type: String,
      enum: ["General", "VIP", "VVIP"],
      default: "General",
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    price: {
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    stripePaymentIntentId: {
      type: String,
      default: "",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false }
);
 
// ticketSchema.pre("find", function (next) {
//   this.find({ isDeleted: { $ne: true } });
//   next();
// });
 
// ticketSchema.pre("findOne", function (next) {
//   this.find({ isDeleted: { $ne: true } });
//   next();
// });

ticketSchema.pre("find", function (next) {
  // শুধু Ticket collection এর query তে filter করো
  if (this.model.modelName === "Ticket") {
    this.find({ isDeleted: { $ne: true } });
  }
  next();
});

ticketSchema.pre("findOne", function (next) {
  if (this.model.modelName === "Ticket") {
    this.find({ isDeleted: { $ne: true } });
  }
  next();
});
 
export const Ticket = model<ITicket>("Ticket", ticketSchema);