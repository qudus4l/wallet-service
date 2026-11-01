import { type User, type UserRole, type UserStatus } from '../../../database/entities/user.entity';

export class UserResponseDto {
  id!: string;
  email!: string;
  phone!: string | null;
  fullName!: string;
  role!: UserRole;
  status!: UserStatus;
  /** ISO-8601 timestamp. */
  createdAt!: string;

  static from(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
