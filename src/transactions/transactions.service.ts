import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TransactionOrderField =
  | 'createdAt'
  | 'from_username'
  | 'to_username'
  | 'amount'
  | 'type';

export interface ListTransactionsParams {
  start: number;
  length: number;
  search?: string;
  orderByField: TransactionOrderField;
  orderDir: 'asc' | 'desc';
  fromUsername?: string;
  toUsername?: string;
  type?: 'DEBIT' | 'CREDIT';
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTransactions(params: ListTransactionsParams) {
    const {
      start,
      length,
      search,
      orderByField,
      orderDir,
      fromUsername,
      toUsername,
      type,
      minAmount,
      maxAmount,
      dateFrom,
      dateTo,
    } = params;

    const where: any = {};

    const and: any[] = [];

    if (search) {
      and.push({
        OR: [
          {
            fromUser: {
              username: { contains: search, mode: 'insensitive' },
            },
          },
          {
            toUser: {
              username: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    if (fromUsername) {
      and.push({
        fromUser: {
          username: { contains: fromUsername, mode: 'insensitive' },
        },
      });
    }

    if (toUsername) {
      and.push({
        toUser: {
          username: { contains: toUsername, mode: 'insensitive' },
        },
      });
    }

    if (type === 'DEBIT' || type === 'CREDIT') {
      and.push({ type });
    }

    const amountConditions: any = {};
    if (typeof minAmount === 'number' && Number.isFinite(minAmount)) {
      amountConditions.gte = BigInt(Math.floor(minAmount));
    }
    if (typeof maxAmount === 'number' && Number.isFinite(maxAmount)) {
      amountConditions.lte = BigInt(Math.floor(maxAmount));
    }
    if (Object.keys(amountConditions).length > 0) {
      and.push({ amount: amountConditions });
    }

    const dateConditions: any = {};
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      if (!Number.isNaN(fromDate.getTime())) {
        dateConditions.gte = fromDate;
      }
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      if (!Number.isNaN(toDate.getTime())) {
        dateConditions.lte = toDate;
      }
    }
    if (Object.keys(dateConditions).length > 0) {
      and.push({ createdAt: dateConditions });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    let orderBy: any;
    switch (orderByField) {
      case 'amount':
        orderBy = { amount: orderDir };
        break;
      case 'from_username':
        orderBy = { fromUser: { username: orderDir } };
        break;
      case 'to_username':
        orderBy = { toUser: { username: orderDir } };
        break;
      case 'type':
        orderBy = { type: orderDir };
        break;
      case 'createdAt':
      default:
        orderBy = { createdAt: orderDir };
        break;
    }

    const [records, filteredCount, totalCount] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip: start,
        take: length,
        orderBy,
        include: {
          fromUser: true,
          toUser: true,
        },
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.count(),
    ]);

    const data = records.map((tx) => ({
      id: tx.id,
      createdAt: tx.createdAt,
      amount: Number(tx.amount),
      type: tx.type,
      from_username: tx.fromUser ? tx.fromUser.username : null,
      to_username: tx.toUser.username,
    }));

    return {
      totalCount,
      filteredCount,
      data,
    };
  }
}
