import type { UserRole, UserStatus } from '@prisma/client';

export type RequestUser = {
  id: string;
  role: UserRole;
  status: UserStatus;
  loginSessionId?: string;
};
