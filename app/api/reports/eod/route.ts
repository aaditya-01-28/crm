import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;
  const role = request.headers.get("x-user-role")!;
  const { searchParams } = new URL(request.url);

  const dateStr = searchParams.get("date") || new Date().toISOString().split("T")[0];
  const targetDate = new Date(dateStr);
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const repFilter = role === "sales_rep" ? repId : searchParams.get("repId") || undefined;

  // All reps in this tenant for the leaderboard
  const reps = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role: { in: ["sales_rep", "sales_manager"] },
      ...(repFilter ? { id: repFilter } : {}),
    },
    select: { id: true, fullName: true },
  });

  const repIds = reps.map((r) => r.id);

  // Call stats per rep
  const callStats = await prisma.callLog.groupBy({
    by: ["repId", "disposition"],
    where: {
      tenantId,
      repId: { in: repIds },
      callTimestamp: { gte: startOfDay, lte: endOfDay },
    },
    _count: { id: true },
    _sum: { durationSeconds: true },
  });

  // Unique phones dialed per rep
  const uniqueDialed = await prisma.$queryRaw<
    { rep_id: string; unique_count: bigint }[]
  >`
    SELECT cl.rep_id, COUNT(DISTINCT l.phone_number) as unique_count
    FROM call_logs cl
    JOIN leads l ON cl.lead_id = l.id
    WHERE cl.tenant_id = ${tenantId}::uuid
      AND cl.rep_id = ANY(${repIds}::uuid[])
      AND cl.call_timestamp BETWEEN ${startOfDay} AND ${endOfDay}
    GROUP BY cl.rep_id
  `;

  // Demos booked today
  const demosBooked = await prisma.scheduledTask.groupBy({
    by: ["repId"],
    where: {
      tenantId,
      repId: { in: repIds },
      taskType: "product_demo",
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
    _count: { id: true },
  });

  // Demos completed today
  const demosCompleted = await prisma.scheduledTask.groupBy({
    by: ["repId"],
    where: {
      tenantId,
      repId: { in: repIds },
      taskType: "product_demo",
      status: "completed",
      updatedAt: { gte: startOfDay, lte: endOfDay },
    },
    _count: { id: true },
  });

  // Deals (quotes sent, total quoted)
  const dealStats = await prisma.deal.groupBy({
    by: ["repId"],
    where: {
      tenantId,
      repId: { in: repIds },
      stage: { in: ["quote_sent", "payment_pending", "closed_won"] },
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
    _count: { id: true },
    _sum: { quotedPrice: true },
  });

  // Payments collected today (approved)
  const paymentStats = await prisma.payment.groupBy({
    by: ["repId"],
    where: {
      tenantId,
      repId: { in: repIds },
      opsApprovalStatus: "approved",
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
    _count: { id: true },
    _sum: { finalAmount: true },
  });

  // Aggregate per rep
  const metrics = reps.map((rep) => {
    const repCalls = callStats.filter((c) => c.repId === rep.id);
    const totalCalls = repCalls.reduce((sum, c) => sum + c._count.id, 0);
    const connected = repCalls
      .filter((c) => c.disposition === "Connected")
      .reduce((sum, c) => sum + c._count.id, 0);
    const talkTimeSecs = repCalls.reduce(
      (sum, c) => sum + (c._sum.durationSeconds || 0),
      0
    );
    const uniqueCount =
      Number(uniqueDialed.find((u) => u.rep_id === rep.id)?.unique_count || 0);
    const demosB =
      demosBooked.find((d) => d.repId === rep.id)?._count.id || 0;
    const demosC =
      demosCompleted.find((d) => d.repId === rep.id)?._count.id || 0;
    const deals = dealStats.find((d) => d.repId === rep.id);
    const payments = paymentStats.find((p) => p.repId === rep.id);

    return {
      repId: rep.id,
      repName: rep.fullName,
      totalCalls,
      uniqueDialed: uniqueCount,
      connectedCalls: connected,
      talkTimeMins: Math.round(talkTimeSecs / 60),
      demosBooked: demosB,
      demosCompleted: demosC,
      quotesSent: deals?._count.id || 0,
      totalQuotedValue: Number(deals?._sum.quotedPrice || 0),
      paymentsCollected: payments?._count.id || 0,
      revenueCollected: Number(payments?._sum.finalAmount || 0),
    };
  });

  // Team totals
  const totals = metrics.reduce(
    (acc, m) => ({
      totalCalls: acc.totalCalls + m.totalCalls,
      uniqueDialed: acc.uniqueDialed + m.uniqueDialed,
      connectedCalls: acc.connectedCalls + m.connectedCalls,
      talkTimeMins: acc.talkTimeMins + m.talkTimeMins,
      demosBooked: acc.demosBooked + m.demosBooked,
      demosCompleted: acc.demosCompleted + m.demosCompleted,
      quotesSent: acc.quotesSent + m.quotesSent,
      totalQuotedValue: acc.totalQuotedValue + m.totalQuotedValue,
      paymentsCollected: acc.paymentsCollected + m.paymentsCollected,
      revenueCollected: acc.revenueCollected + m.revenueCollected,
    }),
    {
      totalCalls: 0,
      uniqueDialed: 0,
      connectedCalls: 0,
      talkTimeMins: 0,
      demosBooked: 0,
      demosCompleted: 0,
      quotesSent: 0,
      totalQuotedValue: 0,
      paymentsCollected: 0,
      revenueCollected: 0,
    }
  );

  return NextResponse.json({ date: dateStr, reps: metrics, totals });
}
