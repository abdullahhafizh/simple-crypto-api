import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimitGuard } from '../rate-limit.guard';
import { ReportingService } from './reporting.service';

interface RequestWithUser extends Request {
  user: { id: string };
}

@Controller()
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('top_transactions_per_user')
  async topTransactions(
    @Req() req: RequestWithUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.reportingService.getTopTransactionsForUser(req.user.id, {
      dateFrom,
      dateTo,
    });
  }

  @Get('top_users')
  async topUsers(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.reportingService.getTopUsers({
      dateFrom,
      dateTo,
    });
  }
}
