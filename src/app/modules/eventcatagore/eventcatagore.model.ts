import { Schema, model } from 'mongoose';
import { ICategory } from './eventcatagore.interface';


const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    image: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    isPopular: { type: Boolean, default: false }, 
  },
  
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual: category te koi ta event ache
categorySchema.virtual('eventCount', {
  ref: 'Event',
  localField: '_id',
  foreignField: 'category',
  count: true,
});

export const Category = model<ICategory>('Category', categorySchema);
