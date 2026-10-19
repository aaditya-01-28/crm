import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";
  const { searchParams } = new URL(request.url);

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const dateFromStr = searchParams.get("dateFrom") || searchParams.get("startDate") || searchParams.get("date") || todayStr;
  const dateToStr = searchParams.get("dateTo") || searchParams.get("endDate") || searchParams.get("date") || dateFromStr;

  const startOfDay = new Date(`${dateFromStr}T00:00:00`);
  const endOfDay = new Date(`${dateToStr}T23:59:59.999`);

  const repFilter = role === "sales_rep" ? repId : searchParams.get("repId") || undefined;

  try {
    return await withClient(async (client) => {
      const repsRes = await client.query(
        `SELECT id, full_name as "fullName"
         FROM users
         WHERE tenant_id = $1 AND is_active = true AND role IN ('sales_rep', 'sales_manager')
           ${repFilter ? "AND id = $2" : ""}
         ORDER BY full_name ASC`,
        repFilter ? [tenantId, repFilter] : [tenantId]
      );

      const reps = repsRes.rows;
      if (reps.length === 0) {
        return NextResponse.json({
          date: dateFromStr === dateToStr ? dateFromStr : `${dateFromStr} to ${dateToStr}`,
          dateFrom: dateFromStr,
          dateTo: dateToStr,
          reps: [],
          totals: {
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
          },
        });
      }

      const repIds = reps.map((r) => r.id);

      const [callStatsRes, uniqueDialedRes, demosBookedRes, demosCompletedRes, dealStatsRes, paymentStatsRes] =
        await Promise.all([
          client.query(
            `SELECT rep_id, disposition, COUNT(id)::int as count, COALESCE(SUM(duration_seconds), 0)::int as duration
             FROM call_logs
             WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
               AND call_timestamp >= $3 AND call_timestamp <= $4
             GROUP BY rep_id, disposition`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT cl.rep_id, COUNT(DISTINCT l.phone_number)::int as unique_count
             FROM call_logs cl
             JOIN leads l ON cl.lead_id = l.id
             WHERE cl.tenant_id = $1 AND cl.rep_id = ANY($2::uuid[])
               AND cl.call_timestamp >= $3 AND cl.call_timestamp <= $4
             GROUP BY cl.rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT rep_id, COUNT(id)::int as count
             FROM scheduled_tasks
             WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
               AND task_type = 'product_demo' AND created_at >= $3 AND created_at <= $4
             GROUP BY rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT rep_id, COUNT(id)::int as count
             FROM scheduled_tasks
             WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
               AND task_type = 'product_demo' AND status = 'completed'
               AND updated_at >= $3 AND updated_at <= $4
             GROUP BY rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT rep_id, COUNT(id)::int as count, COALESCE(SUM(quoted_price), 0)::numeric as "quotedPrice"
             FROM deals
             WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
               AND stage IN ('quote_sent', 'payment_pending', 'closed_won')
               AND created_at >= $3 AND created_at <= $4
             GROUP BY rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT rep_id, COUNT(id)::int as count, COALESCE(SUM(final_amount), 0)::numeric as "finalAmount"
             FROM payments
             WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
               AND ops_approval_status = 'approved' AND created_at >= $3 AND created_at <= $4
             GROUP BY rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
        ]);

      const callStats = callStatsRes.rows;
      const uniqueDialed = uniqueDialedRes.rows;
      const demosBooked = demosBookedRes.rows;
      const demosCompleted = demosCompletedRes.rows;
      const dealStats = dealStatsRes.rows;
      const paymentStats = paymentStatsRes.rows;

      const metrics = reps.map((rep) => {
        const repCalls = callStats.filter((c: any) => c.rep_id === rep.id);
        const totalCalls = repCalls.reduce((sum: number, c: any) => sum + Number(c.count), 0);
        const connected = repCalls
          .filter((c: any) => c.disposition === "Connected")
          .reduce((sum: number, c: any) => sum + Number(c.count), 0);
        const talkTimeSecs = repCalls.reduce(
          (sum: number, c: any) => sum + Number(c.duration || 0),
          0
        );
        const uniqueCount = Number(uniqueDialed.find((u: any) => u.rep_id === rep.id)?.unique_count || 0);
        const demosB = demosBooked.find((d: any) => d.rep_id === rep.id)?.count || 0;
        const demosC = demosCompleted.find((d: any) => d.rep_id === rep.id)?.count || 0;
        const deals = dealStats.find((d: any) => d.rep_id === rep.id);
        const payments = paymentStats.find((p: any) => p.rep_id === rep.id);

        return {
          repId: rep.id,
          repName: rep.fullName,
          totalCalls,
          uniqueDialed: uniqueCount,
          connectedCalls: connected,
          talkTimeMins: Math.round(talkTimeSecs / 60),
          demosBooked: demosB,
          demosCompleted: demosC,
          quotesSent: deals?.count || 0,
          totalQuotedValue: Number(deals?.quotedPrice || 0),
          paymentsCollected: payments?.count || 0,
          revenueCollected: Number(payments?.finalAmount || 0),
        };
      });

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

      return NextResponse.json({
        date: dateFromStr === dateToStr ? dateFromStr : `${dateFromStr} to ${dateToStr}`,
        dateFrom: dateFromStr,
        dateTo: dateToStr,
        reps: metrics,
        totals,
      });
    });
  } catch (error) {
    console.error("[REPORTS EOD]", error);
    return NextResponse.json({ error: "Failed to generate EOD report" }, { status: 500 });
  }
}
