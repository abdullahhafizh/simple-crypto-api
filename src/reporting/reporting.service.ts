import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface TopTransactionRow {
  username: string;
  amount: bigint;
  createdAt: Date;
}

interface TopUserRow {
  username: string;
  transacted_value: bigint;
}

interface DateRangeFilter {
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async getTopTransactionsForUser(
    userId: string,
    filter?: DateRangeFilter,
  ): Promise<{ username: string; amount: number }[]> {
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (filter?.dateFrom && filter.dateFrom.trim() !== '') {
      const d = new Date(filter.dateFrom);
      if (!Number.isNaN(d.getTime())) {
        dateFrom = d;
      }
    }

    if (filter?.dateTo && filter.dateTo.trim() !== '') {
      const d = new Date(filter.dateTo);
      if (!Number.isNaN(d.getTime())) {
        dateTo = d;
      }
    }

    let rows: TopTransactionRow[] = [];

    if (!dateFrom && !dateTo) {
      rows = await (this.prisma as any).$queryRaw<TopTransactionRow[]>`
        SELECT *
        FROM (
          -- Outbound transfers (debits): current user is pengirim, amount negatif
          SELECT
            other."username" AS "username",
            -t."amount"      AS "amount",
            t."createdAt"    AS "createdAt"
          FROM "Transaction" t
          JOIN "User" other ON other."id" = t."toUserId"
          WHERE t."fromUserId" = ${userId}
            AND t."type" = 'DEBIT'

          UNION ALL

          -- Inbound transfers (credits): current user adalah penerima, amount positif
          SELECT
            other."username" AS "username",
            t."amount"       AS "amount",
            t."createdAt"    AS "createdAt"
          FROM "Transaction" t
          JOIN "User" other ON other."id" = t."fromUserId"
          WHERE t."toUserId" = ${userId}
            AND t."type" = 'CREDIT'
        ) q
        ORDER BY ABS(q."amount") DESC, q."createdAt" DESC
        LIMIT 10
      `;
    } else if (dateFrom && dateTo) {
      rows = await (this.prisma as any).$queryRaw<TopTransactionRow[]>`
        SELECT *
        FROM (
          -- Outbound transfers (debits): current user is pengirim, amount negatif
          SELECT
            other."username" AS "username",
            -t."amount"      AS "amount",
            t."createdAt"    AS "createdAt"
          FROM "Transaction" t
          JOIN "User" other ON other."id" = t."toUserId"
          WHERE t."fromUserId" = ${userId}
            AND t."type" = 'DEBIT'
            AND t."createdAt" >= ${dateFrom}
            AND t."createdAt" <= ${dateTo}

          UNION ALL

          -- Inbound transfers (credits): current user adalah penerima, amount positif
          SELECT
            other."username" AS "username",
            t."amount"       AS "amount",
            t."createdAt"    AS "createdAt"
          FROM "Transaction" t
          JOIN "User" other ON other."id" = t."fromUserId"
          WHERE t."toUserId" = ${userId}
            AND t."type" = 'CREDIT'
            AND t."createdAt" >= ${dateFrom}
            AND t."createdAt" <= ${dateTo}
        ) q
        ORDER BY ABS(q."amount") DESC, q."createdAt" DESC
        LIMIT 10
      `;
    } else if (dateFrom) {
      rows = await (this.prisma as any).$queryRaw<TopTransactionRow[]>`
        SELECT *
        FROM (
          -- Outbound transfers (debits): current user is pengirim, amount negatif
          SELECT
            other."username" AS "username",
            -t."amount"      AS "amount",
            t."createdAt"    AS "createdAt"
          FROM "Transaction" t
          JOIN "User" other ON other."id" = t."toUserId"
          WHERE t."fromUserId" = ${userId}
            AND t."type" = 'DEBIT'
            AND t."createdAt" >= ${dateFrom}

          UNION ALL

          -- Inbound transfers (credits): current user adalah penerima, amount positif
          SELECT
            other."username" AS "username",
            t."amount"       AS "amount",
            t."createdAt"    AS "createdAt"
          FROM "Transaction" t
          JOIN "User" other ON other."id" = t."fromUserId"
          WHERE t."toUserId" = ${userId}
            AND t."type" = 'CREDIT'
            AND t."createdAt" >= ${dateFrom}
        ) q
        ORDER BY ABS(q."amount") DESC, q."createdAt" DESC
        LIMIT 10
      `;
    } else {
      rows = await (this.prisma as any).$queryRaw<TopTransactionRow[]>`
        SELECT *
        FROM (
          -- Outbound transfers (debits): current user is pengirim, amount negatif
          SELECT
            other."username" AS "username",
            -t."amount"      AS "amount",
            t."createdAt"    AS "createdAt"
          FROM "Transaction" t
          JOIN "User" other ON other."id" = t."toUserId"
          WHERE t."fromUserId" = ${userId}
            AND t."type" = 'DEBIT'
            AND t."createdAt" <= ${dateTo}

          UNION ALL

          -- Inbound transfers (credits): current user adalah penerima, amount positif
          SELECT
            other."username" AS "username",
            t."amount"       AS "amount",
            t."createdAt"    AS "createdAt"
          FROM "Transaction" t
          JOIN "User" other ON other."id" = t."fromUserId"
          WHERE t."toUserId" = ${userId}
            AND t."type" = 'CREDIT'
            AND t."createdAt" <= ${dateTo}
        ) q
        ORDER BY ABS(q."amount") DESC, q."createdAt" DESC
        LIMIT 10
      `;
    }

    return rows.map((row) => ({
      username: row.username,
      amount: Number(row.amount),
    }));
  }

  async getTopUsers(filter?: DateRangeFilter): Promise<{ username: string; transacted_value: number }[]> {
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (filter?.dateFrom && filter.dateFrom.trim() !== '') {
      const d = new Date(filter.dateFrom);
      if (!Number.isNaN(d.getTime())) {
        dateFrom = d;
      }
    }

    if (filter?.dateTo && filter.dateTo.trim() !== '') {
      const d = new Date(filter.dateTo);
      if (!Number.isNaN(d.getTime())) {
        dateTo = d;
      }
    }

    const hasDateFilter = Boolean(dateFrom) || Boolean(dateTo);

    if (!hasDateFilter) {
      const stats = await (this.prisma as any).userTransferStats.findMany({
        orderBy: { totalOutbound: 'desc' },
        take: 10,
        include: { user: true },
      });

      return stats.map((row: any) => ({
        username: row.user.username,
        transacted_value: Number(row.totalOutbound),
      }));
    }

    let rows: TopUserRow[] = [];

    if (dateFrom && dateTo) {
      rows = await (this.prisma as any).$queryRaw<TopUserRow[]>`
        SELECT
          u."username" AS "username",
          SUM(t."amount") AS "transacted_value"
        FROM "Transaction" t
        JOIN "User" u ON u."id" = t."fromUserId"
        WHERE t."type" = 'DEBIT'
          AND t."createdAt" >= ${dateFrom}
          AND t."createdAt" <= ${dateTo}
        GROUP BY u."username"
        ORDER BY SUM(t."amount") DESC
        LIMIT 10
      `;
    } else if (dateFrom) {
      rows = await (this.prisma as any).$queryRaw<TopUserRow[]>`
        SELECT
          u."username" AS "username",
          SUM(t."amount") AS "transacted_value"
        FROM "Transaction" t
        JOIN "User" u ON u."id" = t."fromUserId"
        WHERE t."type" = 'DEBIT'
          AND t."createdAt" >= ${dateFrom}
        GROUP BY u."username"
        ORDER BY SUM(t."amount") DESC
        LIMIT 10
      `;
    } else if (dateTo) {
      rows = await (this.prisma as any).$queryRaw<TopUserRow[]>`
        SELECT
          u."username" AS "username",
          SUM(t."amount") AS "transacted_value"
        FROM "Transaction" t
        JOIN "User" u ON u."id" = t."fromUserId"
        WHERE t."type" = 'DEBIT'
          AND t."createdAt" <= ${dateTo}
        GROUP BY u."username"
        ORDER BY SUM(t."amount") DESC
        LIMIT 10
      `;
    }

    return rows.map((row) => ({
      username: row.username,
      transacted_value: Number(row.transacted_value),
    }));
  }
}
