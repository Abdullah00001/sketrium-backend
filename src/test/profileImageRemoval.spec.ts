jest.mock('../app/utils/fileHelper', () => ({ deleteFromS3: jest.fn() }));

import { deleteFromS3 } from '../app/utils/fileHelper';
import { cleanupRemovedProfileImages, getProfileImageRemoval } from '../app/utils/profileImageRemoval';

const deleteMock = deleteFromS3 as jest.Mock;

describe('profile picture removal', () => {
  it('removes each picture independently and supports multipart flags', () => {
    expect(getProfileImageRemoval({ removeProfileImage: true })).toEqual({ image: null });
    expect(getProfileImageRemoval({ removeCoverImage: 'true' })).toEqual({ coverImage: null });
    expect(getProfileImageRemoval({ removeProfileImage: 'true', removeCoverImage: true })).toEqual({ image: null, coverImage: null });
  });

  it('preserves images when flags are absent or false', () => {
    expect(getProfileImageRemoval({})).toEqual({});
    expect(getProfileImageRemoval({ removeProfileImage: 'false', removeCoverImage: false })).toEqual({});
  });

  it.each(['', 'yes', '1', 1, null, [], {}])('rejects invalid flags %p', value => {
    expect(() => getProfileImageRemoval({ removeProfileImage: value })).toThrow('must be true or false');
  });

  it('rejects simultaneous removal and replacement', () => {
    expect(() => getProfileImageRemoval({ removeProfileImage: true }, { image: {} })).toThrow('Cannot remove and replace');
    expect(() => getProfileImageRemoval({ removeCoverImage: true }, { coverImage: {} })).toThrow('Cannot remove and replace');
    expect(() => getProfileImageRemoval({ removeProfileImage: true, image: { id: 'new' } })).toThrow('Cannot remove and replace');
  });

  it('allows removing one picture while replacing the other', () => {
    expect(getProfileImageRemoval({ removeCoverImage: true }, { image: {} })).toEqual({ coverImage: null });
  });

  it('only deletes stored keys for the selected pictures', async () => {
    await cleanupRemovedProfileImages({ image: { id: 'profile-key' }, coverImage: { id: 'cover-key' } }, { image: null });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith('profile-key');
  });

  it('handles repeated removal of already absent images', async () => {
    await cleanupRemovedProfileImages({ image: null, coverImage: null }, { image: null, coverImage: null });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('does not turn a saved removal into an API failure if storage cleanup fails', async () => {
    deleteMock.mockRejectedValue(new Error('storage unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(cleanupRemovedProfileImages({ image: { id: 'old' } }, { image: null })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
