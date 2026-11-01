import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type AuthenticatedRequest } from '../../../common/auth-user';

/** Rate limits per authenticated user where known, otherwise per client IP. */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as AuthenticatedRequest;
    return Promise.resolve(
      request.user ? `user:${request.user.id}` : `ip:${request.ip ?? 'unknown'}`,
    );
  }
}
