import { type Request } from 'express';
import { type UserRole } from '../database/entities/user.entity';

/** The authenticated principal, loaded fresh from the database on every request. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };
