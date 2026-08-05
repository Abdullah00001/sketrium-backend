import { Document, Types } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  image: string;
  description?: string;
  isActive: boolean;
  isPopular: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICategoryFilter {
  searchTerm?: string;
  isActive?: boolean;
}
