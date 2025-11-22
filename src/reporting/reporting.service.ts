import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface TopTransactionRow {
  username: string;
  amount: bigint;
  createdAt: Date;
}

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async getTopTransactionsForUser(userId: string): Promise<{ username: string; amount: number }[]> {
    const rows = await (this.prisma as any).$queryRaw<TopTransactionRow[]>`
      SELECT *
      FROM (
        -- Outbound transfers (debits): current user is pengirim, amount negatif
        SELECT
          other."username" AS "username",
          -t."amount"      AS "amount",
          t."createdAt"    AS "createdAt"
        FROM "Transaction" t
        JOIN "User" other ON other."id" = t."toUserId"
        WHERE t."fromUserId" = ${userId} AND t."type" = 'DEBIT'

        UNION ALL

        -- Inbound transfers (credits): current user adalah penerima, amount positif
        SELECT
          other."username" AS "username",
          t."amount"       AS "amount",
          t."createdAt"    AS "createdAt"
        FROM "Transaction" t
        JOIN "User" other ON other."id" = t."fromUserId"
        WHERE t."toUserId" = ${userId} AND t."type" = 'CREDIT'
      ) q
      ORDER BY ABS(q."amount") DESC, q."createdAt" DESC
      LIMIT 10
    `;

    return rows.map((row) => ({
      username: row.username,
      amount: Number(row.amount),
    }));
  }

  async getTopUsers(): Promise<{ username: string; transacted_value: number }[]> {
    const stats = await (this.prisma as any).userTransferStats.findMany({
      orderBy: { totalOutbound: 'desc' },
      take: 10,
      include: { user: true },
    });

    return stats.map((row) => ({
      username: row.user.username,
      transacted_value: Number(row.totalOutbound),
    }));
  }
}
