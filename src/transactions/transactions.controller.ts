import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimitGuard } from '../rate-limit.guard';
import { TransactionsService, TransactionOrderField } from './transactions.service';

@Controller()
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('transactions')
  async list(@Query() query: Record<string, any>) {
    const draw = Number(query.draw ?? 0) || 0;
    const start = Math.max(0, Number(query.start ?? 0) || 0);

    let length = Number(query.length ?? 10) || 10;
    if (length < 1) {
      length = 10;
    }
    if (length > 100) {
      length = 100;
    }

    const rawSearch =
      (typeof query['search[value]'] === 'string'
        ? (query['search[value]'] as string)
        : typeof query.search === 'string'
        ? (query.search as string)
        : '') ?? '';

    const search = rawSearch.trim();

    const fromUsername =
      typeof query.from === 'string' ? query.from.trim() || undefined : undefined;
    const toUsername =
      typeof query.to === 'string' ? query.to.trim() || undefined : undefined;

    const typeRaw = typeof query.type === 'string' ? query.type.trim() : '';
    const type =
      typeRaw === 'DEBIT' || typeRaw === 'CREDIT' ? (typeRaw as 'DEBIT' | 'CREDIT') : undefined;

    const minAmount =
      typeof query.minAmount === 'string' && query.minAmount.trim() !== ''
        ? Number(query.minAmount)
        : undefined;
    const maxAmount =
      typeof query.maxAmount === 'string' && query.maxAmount.trim() !== ''
        ? Number(query.maxAmount)
        : undefined;

    const dateFrom =
      typeof query.dateFrom === 'string' && query.dateFrom.trim() !== ''
        ? query.dateFrom.trim()
        : undefined;
    const dateTo =
      typeof query.dateTo === 'string' && query.dateTo.trim() !== ''
        ? query.dateTo.trim()
        : undefined;

    const orderColumnRaw = query['order[0][column]'];
    const orderDirRaw = query['order[0][dir]'];

    const columnIndex =
      typeof orderColumnRaw === 'string' ? Number(orderColumnRaw) : 0;

    const orderDir: 'asc' | 'desc' =
      typeof orderDirRaw === 'string' && orderDirRaw.toLowerCase() === 'asc'
        ? 'asc'
        : 'desc';

    const columnsMap: Record<number, TransactionOrderField> = {
      0: 'createdAt',
      1: 'from_username',
      2: 'to_username',
      3: 'amount',
      4: 'type',
    };

    const orderByField =
      columnsMap[Number.isFinite(columnIndex) ? columnIndex : 0] ??
      'createdAt';

    const result = await this.transactionsService.listTransactions({
      start,
      length,
      search: search || undefined,
      orderByField,
      orderDir,
      fromUsername,
      toUsername,
      type,
      minAmount,
      maxAmount,
      dateFrom,
      dateTo,
    });

    return {
      draw,
      recordsTotal: result.totalCount,
      recordsFiltered: result.filteredCount,
      data: result.data,
    };
  }
}
