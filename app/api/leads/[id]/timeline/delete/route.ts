import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";

function mapDispositionToStatus(disposition: string | null | undefined): string {
  const d = (disposition || "").trim().toLowerCase();
  if (!d) return "new";
  if (d === "rnr" || d.includes("ringing") || d.includes("no response")) return "rnr";
  if (d === "interested") return "interested";
  if (d.includes("callback")) return "callback";
  if (d.includes("demo scheduled")) return "demo_scheduled";
  if (d.includes("demo done") || d.includes("demo completed")) return "demo_done";
  if (d.includes("not interested")) return "not_interested";
  if (d.includes("our service") || d === "already using") return "already_using";
  if (d.includes("other") || d.includes("purchased")) return "already_purchased";
  if (d.includes("future")) return "future_requirement";
  if (d.includes("invalid")) return "invalid";
  return "new";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 3 Super Admin can delete lead activity logs
  if (!isAdmin(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admins can delete lead activity logs." },
      { status: 403 }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const callLogIds: string[] = Array.isArray(body.callLogIds) ? body.callLogIds.filter(Boolean) : [];
  const stageHistoryIds: string[] = Array.isArray(body.stageHistoryIds) ? body.stageHistoryIds.filter(Boolean) : [];
  const revertTaskIds: string[] = Array.isArray(body.revertTaskIds) ? body.revertTaskIds.filter(Boolean) : [];
  const deleteTaskIds: string[] = Array.isArray(body.deleteTaskIds) ? body.deleteTaskIds.filter(Boolean) : [];
  const dealIds: string[] = Array.isArray(body.dealIds) ? body.dealIds.filter(Boolean) : [];
  const isDemoDone = Boolean(body.isDemoDone);

  if (
    callLogIds.length === 0 &&
    stageHistoryIds.length === 0 &&
    revertTaskIds.length === 0 &&
    deleteTaskIds.length === 0 &&
    dealIds.length === 0
  ) {
    return NextResponse.json({ error: "No log IDs provided" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      await client.query("BEGIN");

      const leadRes = await client.query(
        `SELECT id, status FROM leads WHERE id = $1 AND tenant_id = $2`,
        [leadId, session.tenantId]
      );
      if (leadRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      const currentStatus: string = leadRes.rows[0].status;

      if (callLogIds.length > 0) {
        await client.query(
          `DELETE FROM call_logs
           WHERE id = ANY($1::uuid[]) AND lead_id = $2 AND tenant_id = $3`,
          [callLogIds, leadId, session.tenantId]
        );
      }

      if (stageHistoryIds.length > 0) {
        await client.query(
          `DELETE FROM lead_stage_history
           WHERE id = ANY($1::uuid[]) AND lead_id = $2 AND tenant_id = $3`,
          [stageHistoryIds, leadId, session.tenantId]
        ).catch(() => {});
      }

      if (revertTaskIds.length > 0) {
        await client.query(
          `UPDATE scheduled_tasks
           SET status = 'pending', updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND lead_id = $2 AND tenant_id = $3`,
          [revertTaskIds, leadId, session.tenantId]
        );
      }

      if (deleteTaskIds.length > 0) {
        // Only delete a scheduled task if no other matching Demo Scheduled / Callback log remains on the lead
        const tasksToCheck = await client.query(
          `SELECT id, task_type as "taskType"
           FROM scheduled_tasks
           WHERE id = ANY($1::uuid[]) AND lead_id = $2 AND tenant_id = $3`,
          [deleteTaskIds, leadId, session.tenantId]
        );

        for (const t of tasksToCheck.rows) {
          const isDemo = t.taskType === "product_demo";
          const remainingLogsRes = await client.query(
            isDemo
              ? `SELECT (
                   (SELECT COUNT(*) FROM call_logs WHERE lead_id = $1 AND tenant_id = $2 AND disposition = 'Demo Scheduled') +
                   (SELECT COUNT(*) FROM lead_stage_history WHERE lead_id = $1 AND tenant_id = $2 AND stage_name = 'Demo Scheduled')
                 )::int as cnt`
              : `SELECT (
                   (SELECT COUNT(*) FROM call_logs WHERE lead_id = $1 AND tenant_id = $2 AND disposition ILIKE '%Callback%') +
                   (SELECT COUNT(*) FROM lead_stage_history WHERE lead_id = $1 AND tenant_id = $2 AND stage_name ILIKE '%Callback%')
                 )::int as cnt`,
            [leadId, session.tenantId]
          );
          if ((remainingLogsRes.rows[0]?.cnt || 0) === 0) {
            await client.query(
              `DELETE FROM scheduled_tasks WHERE id = $1 AND lead_id = $2 AND tenant_id = $3`,
              [t.id, leadId, session.tenantId]
            );
          }
        }
      }

      if (dealIds.length > 0) {
        await client.query(
          `DELETE FROM deals
           WHERE id = ANY($1::uuid[]) AND lead_id = $2 AND tenant_id = $3
             AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.deal_id = deals.id)`,
          [dealIds, leadId, session.tenantId]
        );
      }

      // If a Demo Done / Demo Completed entry was removed, clean up any unpaid demo_done deal
      // and revert lead status if no other Demo Done records remain.
      if (isDemoDone) {
        const remainingDemoDoneRes = await client.query(
          `SELECT (
             (SELECT COUNT(*) FROM call_logs WHERE lead_id = $1 AND tenant_id = $2 AND disposition IN ('Demo Done', 'Demo Completed')) +
             (SELECT COUNT(*) FROM scheduled_tasks WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'completed')
           )::int as cnt`,
          [leadId, session.tenantId]
        );
        const remainingCnt = remainingDemoDoneRes.rows[0]?.cnt || 0;

        if (remainingCnt === 0) {
          await client.query(
            `DELETE FROM deals
             WHERE lead_id = $1 AND tenant_id = $2 AND stage = 'demo_done'
               AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.deal_id = deals.id)`,
            [leadId, session.tenantId]
          );

          if (currentStatus === "demo_done") {
            const latestCallRes = await client.query(
              `SELECT disposition FROM call_logs
               WHERE lead_id = $1 AND tenant_id = $2
               ORDER BY call_timestamp DESC LIMIT 1`,
              [leadId, session.tenantId]
            );
            let nextStatus = "new";
            if (latestCallRes.rows.length > 0) {
              nextStatus = mapDispositionToStatus(latestCallRes.rows[0].disposition);
            } else {
              const pendingDemoRes = await client.query(
                `SELECT 1 FROM scheduled_tasks
                 WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'pending'
                 LIMIT 1`,
                [leadId, session.tenantId]
              );
              if (pendingDemoRes.rows.length > 0) nextStatus = "demo_scheduled";
            }

            await client.query(
              `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
              [nextStatus, leadId, session.tenantId]
            );
          }
        }
      }

      // Recalculate RNR count from remaining call logs
      await client.query(
        `UPDATE leads
         SET rnr_count = COALESCE((SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1 AND disposition = 'RNR'), 0),
             updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [leadId, session.tenantId]
      );

      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    });
  } catch (error) {
    console.error("[TIMELINE LOG DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete log entry" },
      { status: 500 }
    );
  }
}
