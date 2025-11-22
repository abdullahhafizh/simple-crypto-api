import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { ulid } from 'ulid';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TransferService {
  constructor(private readonly prisma: PrismaService) {}

  async transfer(fromUserId: string, toUsername: string, amount: number): Promise<void> {
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    const toUser = await this.prisma.user.findUnique({
      where: { username: toUsername },
    });

    if (!toUser) {
      throw new NotFoundException('Target user not found');
    }

    const toUserId = toUser.id;
    const transferAmount = BigInt(amount);

    await this.prisma.$transaction(async (tx) => {
      const [firstLockId, secondLockId] =
        fromUserId < toUserId ? [fromUserId, toUserId] : [toUserId, fromUserId];

      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${firstLockId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${secondLockId} FOR UPDATE`;

      const [creditAgg, debitAgg] = await Promise.all([
        tx.transaction.aggregate({
          where: { toUserId: fromUserId, type: TransactionType.CREDIT },
          _sum: { amount: true },
        }),
        tx.transaction.aggregate({
          where: { fromUserId: fromUserId, type: TransactionType.DEBIT },
          _sum: { amount: true },
        }),
      ]);

      const creditSum = creditAgg._sum.amount ?? 0n;
      const debitSum = debitAgg._sum.amount ?? 0n;
      const currentBalance = creditSum - debitSum;

      if (currentBalance < transferAmount) {
        throw new BadRequestException('Insufficient balance');
      }

      const debitId = ulid();
      const creditId = ulid();

      await tx.transaction.create({
        data: {
          id: debitId,
          amount: transferAmount,
          type: TransactionType.DEBIT,
          fromUserId: fromUserId,
          toUserId: toUserId,
        },
      });

      await tx.transaction.create({
        data: {
          id: creditId,
          amount: transferAmount,
          type: TransactionType.CREDIT,
          fromUserId: fromUserId,
          toUserId: toUserId,
        },
      });

      await (tx as any).userTransferStats.upsert({
        where: { userId: fromUserId },
        create: {
          userId: fromUserId,
          totalOutbound: transferAmount,
        },
        update: {
          totalOutbound: {
            increment: transferAmount,
          },
        },
      });
    });
  }
}
