import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isManagerOrAdmin } from "@/lib/rbac";
import { parseScheduledDateTime } from "@/lib/utils";

function mapDispositionMeta(disposition: string): {
  stageName: string;
  stageType: string;
  leadStatus: string | null;
} {
  const d = disposition.trim();
  switch (d) {
    case "Demo Scheduled":
      return { stageName: "Demo Scheduled", stageType: "demo", leadStatus: "demo_scheduled" };
    case "Demo Done":
    case "Demo Completed":
      return { stageName: "Demo Done", stageType: "demo", leadStatus: "demo_done" };
    case "Callback":
    case "Callback Requested":
      return { stageName: "Callback Requested", stageType: "callback", leadStatus: "callback" };
    case "RNR":
      return { stageName: "RNR", stageType: "status", leadStatus: "rnr" };
    case "Interested":
      return { stageName: "Interested", stageType: "status", leadStatus: "interested" };
    case "Future Requirement":
      return { stageName: "Future Requirement", stageType: "status", leadStatus: "future_requirement" };
    case "Already Using Our Service":
    case "Already Using":
      return { stageName: "Already Using Our Service", stageType: "status", leadStatus: "already_using" };
    case "Already Purchased or Using Other Company Service":
      return { stageName: "Using Other Company Service", stageType: "status", leadStatus: "already_purchased" };
    case "Not Interested":
      return { stageName: "Not Interested", stageType: "status", leadStatus: "not_interested" };
    case "Invalid":
    case "Switched Off":
      return { stageName: "Invalid", stageType: "status", leadStatus: "invalid" };
    case "Connected":
      return { stageName: "Connected", stageType: "status", leadStatus: "callback" };
    default:
      return { stageName: d, stageType: "status", leadStatus: null };
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 2 Sales Manager & Level 3 Super Admin can edit logged entries
  if (!isManagerOrAdmin(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 2 Managers and Level 3 Super Admins can edit call & agenda logs." },
      { status: 403 }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const callLogIds: string[] = Array.isArray(body.callLogIds) ? body.callLogIds.filter(Boolean) : [];
  const stageHistoryIds: string[] = Array.isArray(body.stageHistoryIds) ? body.stageHistoryIds.filter(Boolean) : [];
  const taskIds: string[] = Array.isArray(body.taskIds) ? body.taskIds.filter(Boolean) : [];

  const disposition: string | undefined =
    typeof body.disposition === "string" && body.disposition.trim() ? body.disposition.trim() : undefined;
  const hasRemark = body.remark !== undefined;
  const remark: string | null =
    hasRemark ? (body.remark === null ? null : String(body.remark).trim() || null) : null;
  const hasScheduledTime = body.scheduledTime !== undefined;
  const parsedScheduledTime: Date | null =
    hasScheduledTime && body.scheduledTime
      ? parseScheduledDateTime(body.scheduledTime)
      : null;
  if (hasScheduledTime && body.scheduledTime && !parsedScheduledTime) {
    return NextResponse.json({ error: "Invalid scheduledTime format" }, { status: 400 });
  }

  const hasCallTimestamp = body.callTimestamp !== undefined && body.callTimestamp !== null && body.callTimestamp !== "";
  const parsedCallTimestamp: Date | null = hasCallTimestamp
    ? parseScheduledDateTime(body.callTimestamp)
    : null;
  if (hasCallTimestamp && !parsedCallTimestamp) {
    return NextResponse.json({ error: "Invalid callTimestamp format" }, { status: 400 });
  }

  const hasMeetingLink = body.meetingLink !== undefined;
  const meetingLink: string | null =
    hasMeetingLink ? (body.meetingLink ? String(body.meetingLink).trim() : null) : null;

  if (callLogIds.length === 0 && stageHistoryIds.length === 0 && taskIds.length === 0) {
    return NextResponse.json({ error: "No log or task IDs provided to edit" }, { status: 400 });
  }

  const dispMeta = disposition ? mapDispositionMeta(disposition) : null;

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

      // 1. Update call_logs if callLogIds provided
      if (callLogIds.length > 0) {
        await client.query(
          `UPDATE call_logs
           SET disposition = COALESCE($1, disposition),
               remark = CASE WHEN $2::boolean THEN $3 ELSE remark END,
               call_timestamp = COALESCE($4::timestamptz, call_timestamp),
               is_interested = CASE
                 WHEN $1 = 'Interested' THEN true
                 WHEN $1 IN ('RNR', 'Not Interested', 'Invalid', 'Already Using Our Service') THEN false
                 ELSE is_interested
               END
           WHERE id = ANY($5::uuid[]) AND lead_id = $6 AND tenant_id = $7`,
          [
            disposition || null,
            hasRemark,
            remark,
            parsedCallTimestamp,
            callLogIds,
            leadId,
            session.tenantId,
          ]
        );
      }

      // 2. Update lead_stage_history if stageHistoryIds provided
      let stageTaskIdsFromMeta: string[] = [];
      let stageRefCreatedAt: Date | null = null;
      if (stageHistoryIds.length > 0) {
        const stagesRes = await client.query(
          `SELECT id, stage_name, stage_type, metadata, created_at
           FROM lead_stage_history
           WHERE id = ANY($1::uuid[]) AND lead_id = $2 AND tenant_id = $3`,
          [stageHistoryIds, leadId, session.tenantId]
        );

        for (const st of stagesRes.rows) {
          stageRefCreatedAt = stageRefCreatedAt || st.created_at;
          const prevMeta = (typeof st.metadata === "object" && st.metadata !== null) ? { ...st.metadata } : {};
          if (typeof prevMeta.taskId === "string" && prevMeta.taskId) {
            stageTaskIdsFromMeta.push(prevMeta.taskId);
          }

          if (hasScheduledTime) {
            const isoVal = parsedScheduledTime ? parsedScheduledTime.toISOString() : null;
            const stageLow = (dispMeta?.stageName || st.stage_name || "").toLowerCase();
            if (stageLow.includes("demo")) {
              prevMeta.demoDatetime = isoVal;
              if ("demoDate" in prevMeta) prevMeta.demoDate = isoVal;
              if ("scheduledTime" in prevMeta) prevMeta.scheduledTime = isoVal;
              delete prevMeta.callbackDatetime;
            } else {
              prevMeta.callbackDatetime = isoVal;
              if ("retryTime" in prevMeta) prevMeta.retryTime = isoVal;
              if ("scheduledTime" in prevMeta) prevMeta.scheduledTime = isoVal;
              delete prevMeta.demoDatetime;
            }
          }
          if (hasMeetingLink) {
            prevMeta.meetingLink = meetingLink;
          }

          await client.query(
            `UPDATE lead_stage_history
             SET stage_name = COALESCE($1, stage_name),
                 stage_type = COALESCE($2, stage_type),
                 notes = CASE WHEN $3::boolean THEN $4 ELSE notes END,
                 metadata = $5::jsonb
             WHERE id = $6 AND lead_id = $7 AND tenant_id = $8`,
            [
              dispMeta ? dispMeta.stageName : null,
              dispMeta ? dispMeta.stageType : null,
              hasRemark,
              remark,
              JSON.stringify(prevMeta),
              st.id,
              leadId,
              session.tenantId,
            ]
          );
        }
      }

      // 3. Update scheduled_tasks directly (or linked task from stage metadata / matching pending task)
      const effectiveTaskIds = Array.from(new Set([...taskIds, ...stageTaskIdsFromMeta]));
      if (effectiveTaskIds.length > 0) {
        const targetTaskType = dispMeta?.stageType === "demo"
          ? "product_demo"
          : dispMeta?.stageType === "callback"
          ? "callback"
          : null;

        await client.query(
          `UPDATE scheduled_tasks
           SET scheduled_time = CASE WHEN $1::boolean THEN $2::timestamptz ELSE scheduled_time END,
               notes = CASE WHEN $3::boolean THEN $4 ELSE notes END,
               meeting_link = CASE WHEN $5::boolean THEN $6 ELSE meeting_link END,
               task_type = COALESCE($7, task_type),
               updated_at = NOW()
           WHERE id = ANY($8::uuid[]) AND lead_id = $9 AND tenant_id = $10`,
          [
            hasScheduledTime,
            parsedScheduledTime,
            hasRemark,
            remark,
            hasMeetingLink,
            meetingLink,
            targetTaskType,
            effectiveTaskIds,
            leadId,
            session.tenantId,
          ]
        );
      } else if (hasScheduledTime) {
        // Manager edited meeting/callback datetime directly on a call/stage timeline entry:
        // Also update the matching pending task in Agenda so Web Agenda, APK Agenda, and reminders match!
        const candidateTaskRes = await client.query(
          `SELECT id
           FROM scheduled_tasks
           WHERE lead_id = $1 AND tenant_id = $2
           ORDER BY
             CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC,
             ${stageRefCreatedAt ? "ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz))) ASC," : ""}
             updated_at DESC
           LIMIT 1`,
          stageRefCreatedAt ? [leadId, session.tenantId, stageRefCreatedAt] : [leadId, session.tenantId]
        );

        if (candidateTaskRes.rows.length > 0) {
          await client.query(
            `UPDATE scheduled_tasks
             SET scheduled_time = $1::timestamptz,
                 notes = CASE WHEN $2::boolean THEN COALESCE($3, notes) ELSE notes END,
                 updated_at = NOW()
             WHERE id = $4 AND tenant_id = $5`,
            [parsedScheduledTime, hasRemark, remark, candidateTaskRes.rows[0].id, session.tenantId]
          );
        } else if (parsedScheduledTime) {
          // No scheduled task existed yet (e.g. RNR time was fixed into a valid callback time) -> create pending callback
          await client.query(
            `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at)
             SELECT tenant_id, id, assigned_rep_id, $3, $4::timestamptz, $5, 'pending', 'dialer', NOW(), NOW()
             FROM leads WHERE id = $1 AND tenant_id = $2`,
            [
              leadId,
              session.tenantId,
              dispMeta?.stageType === "demo" ? "product_demo" : "callback",
              parsedScheduledTime,
              remark || "Scheduled follow-up (updated by manager)",
            ]
          );
        }
      }

      // If only scheduled_tasks was edited, keep companion recent stage history dates in sync too
      if (taskIds.length > 0 && stageHistoryIds.length === 0 && hasScheduledTime) {
        const isoVal = parsedScheduledTime ? parsedScheduledTime.toISOString() : null;
        await client.query(
          `UPDATE lead_stage_history
           SET metadata = jsonb_set(
                 jsonb_set(COALESCE(metadata, '{}'::jsonb), '{callbackDatetime}', to_jsonb($1::text), true),
                 '{demoDatetime}',
                 to_jsonb($1::text),
                 true
               ),
               notes = CASE WHEN $2::boolean THEN COALESCE($3, notes) ELSE notes END
           WHERE lead_id = $4 AND tenant_id = $5 AND (metadata->>'taskId') = ANY($6::text[])`,
          [isoVal, hasRemark, remark, leadId, session.tenantId, taskIds]
        ).catch(() => {});
      }

      // 4. Sync lead RNR count and latest status if disposition was modified
      await client.query(
        `UPDATE leads
         SET rnr_count = COALESCE((SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1 AND disposition = 'RNR'), 0),
             updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [leadId, session.tenantId]
      );

      if (dispMeta?.leadStatus && callLogIds.length > 0) {
        const latestCallRes = await client.query(
          `SELECT id FROM call_logs WHERE lead_id = $1 AND tenant_id = $2 ORDER BY call_timestamp DESC LIMIT 1`,
          [leadId, session.tenantId]
        );
        if (latestCallRes.rows[0] && callLogIds.includes(latestCallRes.rows[0].id)) {
          await client.query(
            `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
            [dispMeta.leadStatus, leadId, session.tenantId]
          );
        }
      }

      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    });
  } catch (error: any) {
    console.error("[TIMELINE LOG EDIT]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to edit log entry" },
      { status: 500 }
    );
  }
}
