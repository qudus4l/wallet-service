import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AuthenticatedRequest, type AuthUser } from '../auth-user';
import { AppError } from '../errors/app-error';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new AppError('UNAUTHENTICATED', 'Authentication required');
    return user;
  },
);
