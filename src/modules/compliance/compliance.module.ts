import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BlacklistService } from './blacklist.service';

@Module({
  imports: [AuditModule],
  providers: [BlacklistService],
  exports: [BlacklistService],
})
export class ComplianceModule {}
