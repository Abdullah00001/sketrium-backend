// event.model.ts
import { model, Schema } from 'mongoose';
import { IEvent, IReview } from './event.interface';

const replySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const reviewSchema = new Schema<IReview>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      required: true,
    },
    images: [
      {
        id: { type: String, default: '' },
        url: { type: String, default: '' },
      },
    ],
    isAnonymous: {
      type: Boolean,
      default: false,
    },

    replies: [replySchema],
  },
  { timestamps: true },
);

const eventSchema = new Schema<IEvent>(
  {
    title: { type: String },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    daySchedules: [
      {
        date: { type: Date, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String },
      },
    ],

    // date: { type: Date, required: true },
    // time: { type: String, default: "" },
    endDate: { type: Date, required: true },
    address: {
      addressLine1: {
        type: String,
        required: [true, 'Address Line 1 is required'],
        trim: true,
      },
      addressLine2: {
        type: String,
        trim: true,
        default: '',
      },
      city: {
        type: String,
        required: [true, 'City/Town is required'],
        trim: true,
      },
      stateOrProvince: {
        type: String,
        required: [true, 'State/Province is required'],
        trim: true,
      },
      postcode: {
        type: String,
        required: [true, 'Postcode/Zip Code is required'],
        trim: true,
      },
      country: {
        type: String,
        required: [true, 'Country is required'],
        trim: true,
      },
    },

    location: {
      type: {
        type: String,
        enum: ['Point'],
        // default: 'Point'
      },
      coordinates: {
        type: [Number],
      },
    },

    description: { type: String, default: '' },
    price: { type: Number, default: 0 },
    currency: {
      type: String,
      default: 'USD',
    },
    coverImage: {
      id: { type: String, default: '' },
      url: { type: String, default: '' },
    },
    gallery: [
      {
        id: { type: String },
        url: { type: String },
      },
    ],
    host: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    attendees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reviews: [reviewSchema],
    isPast: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },

    skiteeventType: { type: String },
    // ── Visibility Options (Figma) ────────────────────────────
    isHighlighted: { type: Boolean, default: false }, // Highlight Event
    isPinned: { type: Boolean, default: false }, // Pin Event
    isFeatured: { type: Boolean, default: false }, // Feature Placement
    isTopEvent: { type: Boolean, default: false }, // Top Event

    // Event type
    eventType: {
      type: String,
      enum: ['Free Event', 'Paid Event'],
      default: 'Paid Event',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

eventSchema.index({ location: '2dsphere' });

// ── filter deleted ────────────────────────────────────────
eventSchema.pre('find', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

eventSchema.pre('findOne', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

export const Event = model<IEvent>('Event', eventSchema);
