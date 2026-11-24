import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatDuration, getISTDateRange } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;
  const { searchParams } = new URL(request.url);

  const rawDateFrom = searchParams.get("dateFrom") || searchParams.get("startDate") || searchParams.get("date");
  const rawDateTo = searchParams.get("dateTo") || searchParams.get("endDate") || searchParams.get("date");
  const { startOfPeriod: startOfDay, endOfPeriod: endOfDay, istTodayStr } = getISTDateRange(
    rawDateFrom || rawDateTo ? "custom" : "today",
    rawDateFrom,
    rawDateTo
  );
  const dateFromStr = rawDateFrom || istTodayStr;
  const dateToStr = rawDateTo || dateFromStr;

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
            interestedCalls: 0,
            interestedRate: 0,
            talkTimeMins: 0,
            talkTimeSecs: 0,
            talkTimeFormatted: "0m 0s",
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
            `SELECT rep_id,
                    COUNT(id)::int as total_calls,
                    COUNT(CASE 
                      WHEN disposition NOT IN ('RNR', 'Ringing No Response', 'Ring No Response', 'Invalid')
                       AND (duration_seconds > 0 OR disposition IN ('Connected', 'Contacted', 'Answered', 'Callback', 'Callback Requested', 'Demo Scheduled', 'Demo Done', 'Demo Completed', 'Already Using Our Service', 'Already Purchased or Using Other Company Service', 'Not Interested', 'Future Requirement'))
                      THEN 1 
                    END)::int as connected_calls,
                    COUNT(CASE 
                      WHEN disposition IN ('Demo Scheduled', 'Callback', 'Callback Requested', 'Future Requirement', 'Demo Done', 'Demo Completed', 'Quote Sent', 'Won', 'Deal Created')
                        OR disposition ILIKE '%Demo%' OR disposition ILIKE '%Callback%' OR disposition ILIKE '%Future%'
                      THEN 1 
                    END)::int as interested_calls,
                    COALESCE(SUM(duration_seconds), 0)::int as total_duration
             FROM call_logs
             WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
               AND call_timestamp >= $3 AND call_timestamp <= $4
             GROUP BY rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT cl.rep_id, COUNT(DISTINCT COALESCE(l.phone_number, cl.lead_id::text))::int as unique_count
             FROM call_logs cl
             LEFT JOIN leads l ON cl.lead_id = l.id
             WHERE cl.tenant_id = $1 AND cl.rep_id = ANY($2::uuid[])
               AND cl.call_timestamp >= $3 AND cl.call_timestamp <= $4
             GROUP BY cl.rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT rep_id, COUNT(id)::int as count
             FROM scheduled_tasks
             WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
               AND task_type = 'product_demo'
               AND status = 'pending'
               AND (
                 (scheduled_time >= $3 AND scheduled_time <= $4)
                 OR (created_at >= $3 AND created_at <= $4)
               )
             GROUP BY rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT rep_id, COUNT(DISTINCT lead_id)::int as count
             FROM (
               SELECT rep_id, lead_id FROM scheduled_tasks
               WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
                 AND task_type = 'product_demo' AND status = 'completed'
                 AND updated_at >= $3 AND updated_at <= $4
               UNION
               SELECT rep_id, lead_id FROM call_logs
               WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
                 AND (disposition = 'Demo Done' OR disposition = 'Demo Completed')
                 AND call_timestamp >= $3 AND call_timestamp <= $4
             ) done_demos
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
        const repCallStats = callStats.find((c: any) => c.rep_id === rep.id);
        const totalCalls = Number(repCallStats?.total_calls || 0);
        const connected = Number(repCallStats?.connected_calls || 0);
        const interested = Number(repCallStats?.interested_calls || 0);
        const interestedRate = connected > 0 ? Math.round((interested / connected) * 100) : 0;
        const talkTimeSecs = Number(repCallStats?.total_duration || 0);
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
          interestedCalls: interested,
          interestedRate,
          talkTimeMins: Math.round(talkTimeSecs / 60),
          talkTimeSecs,
          talkTimeFormatted: formatDuration(talkTimeSecs),
          demosBooked: demosB,
          demosCompleted: demosC,
          quotesSent: deals?.count || 0,
          totalQuotedValue: Number(deals?.quotedPrice || 0),
          paymentsCollected: payments?.count || 0,
          revenueCollected: Number(payments?.finalAmount || 0),
        };
      });

      const totalTalkTimeSecs = metrics.reduce((sum, m) => sum + (m.talkTimeSecs || 0), 0);
      const totalConnected = metrics.reduce((sum, m) => sum + m.connectedCalls, 0);
      const totalInterested = metrics.reduce((sum, m) => sum + (m.interestedCalls || 0), 0);
      const totalInterestedRate = totalConnected > 0 ? Math.round((totalInterested / totalConnected) * 100) : 0;

      const totals = {
        totalCalls: metrics.reduce((sum, m) => sum + m.totalCalls, 0),
        uniqueDialed: metrics.reduce((sum, m) => sum + m.uniqueDialed, 0),
        connectedCalls: totalConnected,
        interestedCalls: totalInterested,
        interestedRate: totalInterestedRate,
        talkTimeMins: Math.round(totalTalkTimeSecs / 60),
        talkTimeSecs: totalTalkTimeSecs,
        talkTimeFormatted: formatDuration(totalTalkTimeSecs),
        demosBooked: metrics.reduce((sum, m) => sum + m.demosBooked, 0),
        demosCompleted: metrics.reduce((sum, m) => sum + m.demosCompleted, 0),
        quotesSent: metrics.reduce((sum, m) => sum + m.quotesSent, 0),
        totalQuotedValue: metrics.reduce((sum, m) => sum + m.totalQuotedValue, 0),
        paymentsCollected: metrics.reduce((sum, m) => sum + m.paymentsCollected, 0),
        revenueCollected: metrics.reduce((sum, m) => sum + m.revenueCollected, 0),
      };

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
