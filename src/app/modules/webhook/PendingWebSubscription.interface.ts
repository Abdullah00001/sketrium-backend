import { Document } from 'mongoose';

export interface IPendingWebSubscription extends Document {
  email: string;
  plan_id: string;
  status: string;
  created_at?: Date;
  updated_at?: Date;
}
