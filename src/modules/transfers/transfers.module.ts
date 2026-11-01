import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { AuditModule } from '../audit/audit.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [ComplianceModule, AuditModule],
  controllers: [TransfersController],
  providers: [TransfersService, IdempotencyService],
  exports: [TransfersService],
})
export class TransfersModule {}
