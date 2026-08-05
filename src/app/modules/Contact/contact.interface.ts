import { Document, Types } from "mongoose";

export type ContactStatus = "pending" | "read" | "replied";

export interface IContact {
  phoneNumber: string;
  email?: string | null;
  message: string;
  status: ContactStatus;
  ipAddress?: string | null;
    user: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IContactDocument extends IContact, Document {
  _id: Types.ObjectId;
}

export interface CreateContactDto {
  phoneNumber: string;
  email?: string;
  message: string;
}

export interface UpdateContactStatusDto {
  status: ContactStatus;
}

export interface ContactQueryParams {
  page?: number;
  limit?: number;
  status?: ContactStatus;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPage: number;
}

export interface ContactStats {
  total: number;
  pending: number;
  read: number;
  replied: number;
}