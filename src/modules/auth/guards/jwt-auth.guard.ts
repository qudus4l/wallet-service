import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { type AuthenticatedRequest } from '../../../common/auth-user';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AppError } from '../../../common/errors/app-error';
import { UsersService } from '../../users/users.service';
import { type JwtPayload } from '../auth.service';

/**
 * Global, default-deny authentication. The user is reloaded on every request so that
 * blocking takes effect immediately and the role is taken from the database, not the token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new AppError('UNAUTHENTICATED', 'A bearer token is required');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new AppError('UNAUTHENTICATED', 'The access token is invalid or has expired');
    }

    const user = await this.users.findById(payload.sub);
    if (!user) throw new AppError('UNAUTHENTICATED', 'The access token is invalid or has expired');
    if (user.status === 'BLOCKED') throw new AppError('ACCOUNT_BLOCKED', 'This account is blocked');

    request.user = { id: user.id, email: user.email, role: user.role };
    return true;
  }
}
