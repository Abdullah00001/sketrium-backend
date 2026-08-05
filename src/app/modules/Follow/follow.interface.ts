import { Types } from "mongoose";

export interface IFollow {
  _id?: Types.ObjectId;
  follower: Types.ObjectId; // যে follow করছে
  following: Types.ObjectId; // যাকে follow করা হচ্ছে
  createdAt?: Date;
  updatedAt?: Date;
}