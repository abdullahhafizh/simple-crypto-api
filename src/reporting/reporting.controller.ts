import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportingService } from './reporting.service';

interface RequestWithUser extends Request {
  user: { id: string };
}

@Controller()
@UseGuards(JwtAuthGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('top_transactions_per_user')
  async topTransactions(@Req() req: RequestWithUser) {
    return this.reportingService.getTopTransactionsForUser(req.user.id);
  }

  @Get('top_users')
  async topUsers() {
    return this.reportingService.getTopUsers();
  }
}
