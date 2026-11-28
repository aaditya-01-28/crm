import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { can, isSalesRep } from "@/lib/rbac";
import { isValidUuid } from "@/lib/security";
import { formatDuration, getISTDateRange, interestedCallSql, dealCloseDateSql, dealQuoteDateSql } from "@/lib/utils";
import { ensureDealSplitsTable, effectiveDealSharesCte } from "@/lib/deal-splits";

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  if (!isSalesRep(role) && !can(role, "reports:view_all")) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to view EOD reports." },
      { status: 403 }
    );
  }

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

  const requestedRepId = searchParams.get("repId");
  if (!isSalesRep(role) && requestedRepId && requestedRepId !== "all" && !isValidUuid(requestedRepId)) {
    return NextResponse.json({ error: "Invalid repId" }, { status: 400 });
  }
  const repFilter = isSalesRep(role)
    ? repId
    : requestedRepId && requestedRepId !== "all"
    ? requestedRepId
    : undefined;

  try {
    return await withClient(async (client) => {
      await ensureDealSplitsTable(client);
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

      const [
        callStatsRes,
        uniqueDialedRes,
        demosBookedRes,
        demosCompletedRes,
        dealStatsRes,
        paymentStatsRes,
        distinctDealTotalsRes,
        distinctPaymentTotalsRes,
      ] = await Promise.all([
          client.query(
            `SELECT rep_id,
                    COUNT(id)::int as total_calls,
                    COUNT(CASE 
                      WHEN disposition NOT IN ('RNR', 'Ringing No Response', 'Ring No Response', 'Invalid')
                       AND (duration_seconds > 0 OR disposition IN ('Connected', 'Interested', 'Contacted', 'Answered', 'Callback', 'Callback Requested', 'Demo Scheduled', 'Demo Done', 'Demo Completed', 'Already Using Our Service', 'Already Purchased or Using Other Company Service', 'Not Interested', 'Future Requirement'))
                      THEN 1 
                    END)::int as connected_calls,
                    COUNT(CASE 
                      WHEN ${interestedCallSql()}
                      THEN 1 
                    END)::int as interested_calls,
                    COALESCE(SUM(duration_seconds), 0)::int as total_duration
             FROM call_logs
             WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
               AND call_timestamp >= $3 AND call_timestamp <= $4
               AND COALESCE(log_source, 'dialer_web') <> 'sheet_import'
             GROUP BY rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT cl.rep_id, COUNT(DISTINCT COALESCE(l.phone_number, cl.lead_id::text))::int as unique_count
             FROM call_logs cl
             LEFT JOIN leads l ON cl.lead_id = l.id
             WHERE cl.tenant_id = $1 AND cl.rep_id = ANY($2::uuid[])
               AND cl.call_timestamp >= $3 AND cl.call_timestamp <= $4
               AND COALESCE(cl.log_source, 'dialer_web') <> 'sheet_import'
             GROUP BY cl.rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `SELECT rep_id, COUNT(DISTINCT lead_id)::int as count
             FROM (
               SELECT rep_id, lead_id
               FROM scheduled_tasks
               WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
                 AND task_type = 'product_demo'
                 AND status = 'pending'
                 AND (
                   (scheduled_time >= $3 AND scheduled_time <= $4)
                   OR (created_at >= $3 AND created_at <= $4)
                 )
               UNION
               SELECT rep_id, lead_id
               FROM call_logs
               WHERE tenant_id = $1 AND rep_id = ANY($2::uuid[])
                 AND disposition = 'Demo Scheduled'
                 AND call_timestamp >= $3 AND call_timestamp <= $4
             ) booked_demos
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
            `WITH ${effectiveDealSharesCte()}
             SELECT eds.rep_id, COUNT(DISTINCT eds.deal_id)::int as count, COALESCE(SUM(d.quoted_price * eds.share_ratio), 0)::numeric as "quotedPrice"
             FROM deals d
             JOIN effective_deal_shares eds ON eds.deal_id = d.id
             WHERE d.tenant_id = $1 AND eds.rep_id = ANY($2::uuid[])
               AND d.stage IN ('quote_sent', 'payment_pending', 'closed_won')
               AND (CASE WHEN d.stage = 'closed_won' THEN ${dealCloseDateSql("d")} WHEN d.stage = 'quote_sent' THEN ${dealQuoteDateSql("d")} ELSE d.created_at END) >= $3
               AND (CASE WHEN d.stage = 'closed_won' THEN ${dealCloseDateSql("d")} WHEN d.stage = 'quote_sent' THEN ${dealQuoteDateSql("d")} ELSE d.created_at END) <= $4
             GROUP BY eds.rep_id`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `WITH ${effectiveDealSharesCte()}
             SELECT COALESCE(eds.rep_id, p.rep_id) as rep_id,
                    COUNT(DISTINCT p.id)::int as count,
                    COALESCE(SUM(p.final_amount * COALESCE(eds.share_ratio, 1.0)), 0)::numeric as "finalAmount"
             FROM payments p
             LEFT JOIN deals pd ON p.deal_id = pd.id
             LEFT JOIN effective_deal_shares eds ON eds.deal_id = p.deal_id
             WHERE p.tenant_id = $1
               AND COALESCE(eds.rep_id, p.rep_id) = ANY($2::uuid[])
               AND p.ops_approval_status = 'approved'
               AND COALESCE(CASE WHEN pd.stage = 'closed_won' THEN ${dealCloseDateSql("pd")} ELSE NULL END, p.created_at) >= $3
               AND COALESCE(CASE WHEN pd.stage = 'closed_won' THEN ${dealCloseDateSql("pd")} ELSE NULL END, p.created_at) <= $4
             GROUP BY COALESCE(eds.rep_id, p.rep_id)`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `WITH ${effectiveDealSharesCte()}
             SELECT COUNT(DISTINCT d.id)::int as count
             FROM deals d
             JOIN effective_deal_shares eds ON eds.deal_id = d.id
             WHERE d.tenant_id = $1 AND eds.rep_id = ANY($2::uuid[])
               AND d.stage IN ('quote_sent', 'payment_pending', 'closed_won')
               AND (CASE WHEN d.stage = 'closed_won' THEN ${dealCloseDateSql("d")} WHEN d.stage = 'quote_sent' THEN ${dealQuoteDateSql("d")} ELSE d.created_at END) >= $3
               AND (CASE WHEN d.stage = 'closed_won' THEN ${dealCloseDateSql("d")} WHEN d.stage = 'quote_sent' THEN ${dealQuoteDateSql("d")} ELSE d.created_at END) <= $4`,
            [tenantId, repIds, startOfDay, endOfDay]
          ),
          client.query(
            `WITH ${effectiveDealSharesCte()}
             SELECT COUNT(DISTINCT p.id)::int as count
             FROM payments p
             LEFT JOIN deals pd ON p.deal_id = pd.id
             LEFT JOIN effective_deal_shares eds ON eds.deal_id = p.deal_id
             WHERE p.tenant_id = $1
               AND COALESCE(eds.rep_id, p.rep_id) = ANY($2::uuid[])
               AND p.ops_approval_status = 'approved'
               AND COALESCE(CASE WHEN pd.stage = 'closed_won' THEN ${dealCloseDateSql("pd")} ELSE NULL END, p.created_at) >= $3
               AND COALESCE(CASE WHEN pd.stage = 'closed_won' THEN ${dealCloseDateSql("pd")} ELSE NULL END, p.created_at) <= $4`,
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
        quotesSent: Number(distinctDealTotalsRes.rows[0]?.count || 0),
        totalQuotedValue: metrics.reduce((sum, m) => sum + m.totalQuotedValue, 0),
        paymentsCollected: Number(distinctPaymentTotalsRes.rows[0]?.count || 0),
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
