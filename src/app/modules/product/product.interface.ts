// product.interface.ts
import { Document, Types } from "mongoose";

export interface IImageFile {
  id: string;
  url: string;
}


// product.interface.ts
export interface IReviewReply {
  user: Types.ObjectId;
  comment: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IReview {
  user: Types.ObjectId;
  rating: number;
  comment: string;
  images?: IImageFile[];
  isAnonymous: boolean;
  replies: IReviewReply[]; // ← এটা add করো
}

// export interface IReview {
//   user: Types.ObjectId;
//   rating: number;
//   comment: string;
//   images?: IImageFile[];
//    reviews: IReview[]; 
//   isAnonymous?: boolean;
//   createdAt?: Date;
//   updatedAt?: Date;
// }

export interface IProduct extends Document {
  name: string;
  category: Types.ObjectId;
  description?: string;
  price: number;
  discount?: number;
  tax?: number;
  currency: string;
  shippingCost?: number;
  colors?: string[];
  sizes?: string[];
  images?: IImageFile[];
  host: Types.ObjectId;
  reviews?: IReview[];
  isDeleted?: boolean;
  stock?: number;
  material?: string;
  discountPrice?: number;
  createdAt?: Date;
  updatedAt?: Date;
}