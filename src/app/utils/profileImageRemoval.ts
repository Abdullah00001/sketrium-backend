import httpStatus from 'http-status';
import AppError from '../error/AppError';
import { deleteFromS3 } from './fileHelper';

export const getProfileImageRemoval = (
  body: Record<string, unknown>,
  uploads: { image?: unknown; coverImage?: unknown } = {},
) => {
  const updates: Record<string, null> = {};
  for (const [flag, field] of [
    ['removeProfileImage', 'image'],
    ['removeCoverImage', 'coverImage'],
  ] as const) {
    const value = body[flag];
    if (value !== undefined && ![true, false, 'true', 'false'].includes(value as boolean | string)) {
      throw new AppError(httpStatus.BAD_REQUEST, `${flag} must be true or false`);
    }
    if (value === true || value === 'true') {
      if (uploads[field] || (body[field] !== undefined && body[field] !== null)) {
        throw new AppError(httpStatus.BAD_REQUEST, `Cannot remove and replace ${field} in the same request`);
      }
      updates[field] = null;
    }
  }
  return updates;
};

// The database change must succeed before old objects are deleted.
export const cleanupRemovedProfileImages = async (
  existing: { image?: { id?: unknown } | null; coverImage?: { id?: unknown } | null },
  removals: Record<string, null>,
) => {
  const keys = new Set<string>();
  for (const field of ['image', 'coverImage'] as const) {
    if (field in removals && existing[field]?.id) keys.add(String(existing[field]!.id));
  }
  for (const key of keys) {
    try {
      await deleteFromS3(key);
    } catch (error) {
      console.error('Failed to clean up removed profile image', error);
    }
  }
};
