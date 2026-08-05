import mongoose, { Schema, Document, Model } from 'mongoose';


export interface IFAQ extends Document {
  category: string;
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}


const faqSchema: Schema<IFAQ> = new Schema(
  {
    // category: {
    //   type: String,
    //   required: [true, 'Category is required'],
    //   default: 'General',
    // },
    question: {
      type: String,
      required: [true, 'Question is required'],
    },
    answer: {
      type: String,
      required: [true, 'Answer is required'],
    },
    // order: {
    //   type: Number,
    //   default: 0,
    // },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, 
  },
);


const FAQ: Model<IFAQ> = mongoose.model<IFAQ>('FAQ', faqSchema);

export default FAQ;
