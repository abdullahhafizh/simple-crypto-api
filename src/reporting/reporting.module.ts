import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, PrismaService, JwtAuthGuard],
})
export class ReportingModule {}
