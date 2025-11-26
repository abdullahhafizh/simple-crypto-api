import "dotenv/config";
import { TransactionType } from "@prisma/client";
import { ulid } from "ulid";
import { PrismaService } from "./prisma/prisma.service";
import { hashPassword } from "./auth/password.util";

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  await prisma.transaction.deleteMany({});
  await (prisma as any).userTransferStats.deleteMany({});
  await prisma.user.deleteMany({});

  const userSpecs = [
    { username: "alice", password: "demo1234" },
    { username: "bob", password: "demo1234" },
    { username: "charlie", password: "demo1234" },
    { username: "diana", password: "demo1234" },
    { username: "erwin", password: "demo1234" },
    { username: "farah", password: "demo1234" },
    { username: "gilang", password: "demo1234" },
    { username: "hannah", password: "demo1234" }
  ];

  const users: { id: string; username: string }[] = [];

  for (const spec of userSpecs) {
    const passwordHash = await hashPassword(spec.password);
    const user = await prisma.user.create({
      data: {
        id: ulid(),
        username: spec.username,
        password: passwordHash
      }
    });
    users.push({ id: user.id, username: user.username });
  }

  // simple deterministic pseudo-random so the demo data looks natural
  let rngSeed = 1_234_567_891;
  const random = () => {
    rngSeed = (rngSeed * 1664525 + 1013904223) % 0xffffffff;
    return rngSeed / 0xffffffff;
  };
  const randomInt = (min: number, max: number) =>
    Math.floor(random() * (max - min + 1)) + min;

  const outboundTotals = new Map<string, bigint>();
  const balances = new Map<string, bigint>();
  const now = new Date();

  // Seed one top-up per user, older than the 30D reporting window so
  // "All" has a base but 7D/30D are dominated by transfers.
  const baseTopupDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    9,
    0,
    0,
    0
  );
  baseTopupDate.setDate(baseTopupDate.getDate() - 40);

  for (let i = 0; i < users.length; i += 1) {
    const user = users[i];
    const baseAmount = 800_000 + i * 250_000;
    const baseAmountBigInt = BigInt(baseAmount);
    await prisma.transaction.create({
      data: {
        id: ulid(),
        amount: baseAmountBigInt,
        type: TransactionType.CREDIT,
        fromUserId: null,
        toUserId: user.id,
        createdAt: baseTopupDate
      }
    });
    balances.set(user.id, baseAmountBigInt);
  }

  // Weighted sender pool so some users naturally rank as "top" senders
  const senderPool: { id: string; weight: number }[] = users.map((user) => {
    let weight = 1;
    if (user.username === "alice") {
      weight = 4;
    } else if (user.username === "bob") {
      weight = 3;
    } else if (
      user.username === "charlie" ||
      user.username === "diana" ||
      user.username === "erwin"
    ) {
      weight = 2;
    }
    return { id: user.id, weight };
  });

  const totalWeight = senderPool.reduce((sum, item) => sum + item.weight, 0);

  const pickSenderId = () => {
    let r = random() * totalWeight;
    for (const item of senderPool) {
      if (r < item.weight) {
        return item.id;
      }
      r -= item.weight;
    }
    return senderPool[0].id;
  };

  const pickReceiverId = (senderId: string) => {
    let candidate = users[randomInt(0, users.length - 1)].id;
    let safety = 0;
    while (candidate === senderId && safety < 5) {
      candidate = users[randomInt(0, users.length - 1)].id;
      safety += 1;
    }
    if (candidate === senderId) {
      const index = users.findIndex((u) => u.id === senderId);
      const nextIndex = (index + 1) % users.length;
      return users[nextIndex].id;
    }
    return candidate;
  };

  const days = 60;

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
    let minTransfers: number;
    let maxTransfers: number;

    if (dayOffset < 7) {
      // last 7 days: busiest so 7D chart looks alive
      minTransfers = 2;
      maxTransfers = 4;
    } else if (dayOffset < 30) {
      // days 8–30: consistent but slightly calmer
      minTransfers = 1;
      maxTransfers = 3;
    } else {
      // older history: occasional transfers so "All" has a nice tail
      minTransfers = 0;
      maxTransfers = 2;
    }

    const transfersTodayTarget = randomInt(minTransfers, maxTransfers);

    let maxExtraTopups = 1;
    if (dayOffset < 14) {
      maxExtraTopups = 2;
    }

    const extraTopupsToday =
      maxExtraTopups > 0 ? randomInt(0, maxExtraTopups) : 0;

    for (let k = 0; k < extraTopupsToday; k += 1) {
      const user = users[randomInt(0, users.length - 1)];
      const topupAmountNumber = randomInt(50_000, 400_000);
      const topupAmount = BigInt(topupAmountNumber);

      const topupDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      );
      topupDate.setDate(topupDate.getDate() - dayOffset);
      topupDate.setHours(
        randomInt(8, 20),
        randomInt(0, 59),
        randomInt(0, 59),
        0
      );

      await prisma.transaction.create({
        data: {
          id: ulid(),
          amount: topupAmount,
          type: TransactionType.CREDIT,
          fromUserId: null,
          toUserId: user.id,
          createdAt: topupDate
        }
      });

      const currentBalance = balances.get(user.id) ?? 0n;
      balances.set(user.id, currentBalance + topupAmount);
    }

    const withdrawalsToday = randomInt(0, dayOffset < 7 ? 1 : 2);

    for (let w = 0; w < withdrawalsToday; w += 1) {
      const user = users[randomInt(0, users.length - 1)];
      const balance = balances.get(user.id) ?? 0n;
      if (balance <= 100_000n) {
        continue;
      }

      const maxWithdrawal = balance / 3n;
      if (maxWithdrawal < 50_000n) {
        continue;
      }

      const maxWithdrawalNumber = Number(maxWithdrawal);
      const withdrawalAmountNumber = randomInt(50_000, maxWithdrawalNumber);
      const withdrawalAmount = BigInt(withdrawalAmountNumber);

      const withdrawDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      );
      withdrawDate.setDate(withdrawDate.getDate() - dayOffset);
      withdrawDate.setHours(
        randomInt(9, 21),
        randomInt(0, 59),
        randomInt(0, 59),
        0
      );

      const withdrawalSinkId = pickReceiverId(user.id);

      await prisma.transaction.create({
        data: {
          id: ulid(),
          amount: withdrawalAmount,
          type: TransactionType.DEBIT,
          fromUserId: user.id,
          toUserId: withdrawalSinkId,
          createdAt: withdrawDate
        }
      });

      balances.set(user.id, balance - withdrawalAmount);
    }

    let createdTransfers = 0;
    let attempts = 0;
    const maxAttempts = transfersTodayTarget * 4;

    while (createdTransfers < transfersTodayTarget && attempts < maxAttempts) {
      attempts += 1;

      const fromId = pickSenderId();
      const toId = pickReceiverId(fromId);

      const senderBalance = balances.get(fromId) ?? 0n;
      if (senderBalance <= 50_000n) {
        continue;
      }

      let minAmount: number;
      let maxAmount: number;

      if (dayOffset < 7) {
        // recent week: larger, more interesting spikes
        minAmount = 150_000;
        maxAmount = 1_000_000;
      } else if (dayOffset < 30) {
        minAmount = 75_000;
        maxAmount = 600_000;
      } else {
        minAmount = 25_000;
        maxAmount = 250_000;
      }

      const maxByBalance = senderBalance / 2n;
      const maxByBalanceNumber = Number(maxByBalance);
      let effectiveMax = maxAmount;
      if (maxByBalanceNumber < effectiveMax) {
        effectiveMax = maxByBalanceNumber;
      }

      if (effectiveMax < minAmount) {
        continue;
      }

      const amountNumber = randomInt(minAmount, effectiveMax);
      const amountBigInt = BigInt(amountNumber);

      const debitDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      );
      debitDate.setDate(debitDate.getDate() - dayOffset);
      debitDate.setHours(
        randomInt(9, 21),
        randomInt(0, 59),
        randomInt(0, 59),
        0
      );

      const creditDate = new Date(
        debitDate.getTime() + randomInt(5, 180) * 1000
      );

      await prisma.transaction.create({
        data: {
          id: ulid(),
          amount: amountBigInt,
          type: TransactionType.DEBIT,
          fromUserId: fromId,
          toUserId: toId,
          createdAt: debitDate
        }
      });

      await prisma.transaction.create({
        data: {
          id: ulid(),
          amount: amountBigInt,
          type: TransactionType.CREDIT,
          fromUserId: fromId,
          toUserId: toId,
          createdAt: creditDate
        }
      });

      const currentTotal = outboundTotals.get(fromId) ?? 0n;
      outboundTotals.set(fromId, currentTotal + amountBigInt);

      const senderNewBalance = (balances.get(fromId) ?? 0n) - amountBigInt;
      const receiverNewBalance = (balances.get(toId) ?? 0n) + amountBigInt;
      balances.set(fromId, senderNewBalance);
      balances.set(toId, receiverNewBalance);

      createdTransfers += 1;
    }
  }

  for (const user of users) {
    const totalOutbound = outboundTotals.get(user.id) ?? 0n;
    if (totalOutbound === 0n) {
      continue;
    }

    await (prisma as any).userTransferStats.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        totalOutbound: totalOutbound
      },
      update: {
        totalOutbound: totalOutbound
      }
    });
  }

  await prisma.onModuleDestroy();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
