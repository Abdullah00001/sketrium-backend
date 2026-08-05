export const USER_ROLE = {
  USER: 'USER',
  admin: 'admin',
  MARCHANT: 'MARCHANT',
  KAATEDJ: 'KAATEDJ',
  ORGANIZER: 'ORGANIZER',
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const UserStatus = ['pending', 'active', 'blocked'];
