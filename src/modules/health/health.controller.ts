import {
  type BeforeApplicationShutdown,
  Controller,
  Get,
  Injectable,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AppError } from '../../common/errors/app-error';

/** Flips to "draining" on SIGTERM so the load balancer stops routing before connections close. */
@Injectable()
export class ShutdownState implements BeforeApplicationShutdown {
  draining = false;

  beforeApplicationShutdown(): void {
    this.draining = true;
  }
}

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly shutdown: ShutdownState,
  ) {}

  /** Process is up. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Ready to serve traffic: database reachable and not shutting down. */
  @Get('ready')
  @HealthCheck()
  ready() {
    if (this.shutdown.draining) throw new AppError('TRY_AGAIN', 'Shutting down');
    return this.health.check([() => this.db.pingCheck('database', { timeout: 2_000 })]);
  }
}
