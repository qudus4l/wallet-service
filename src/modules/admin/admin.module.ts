import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { TransfersModule } from '../transfers/transfers.module';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [AuditModule, ComplianceModule, TransfersModule],
  controllers: [AdminController],
  providers: [AdminUsersService],
})
export class AdminModule {}
