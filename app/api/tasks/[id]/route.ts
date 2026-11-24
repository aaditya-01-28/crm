import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const currentUserId = session?.sub || request.headers.get("x-user-id") || "";

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { status, notes, meetingLink, scheduledTime, action, remark } = body;

    return await withClient(async (client) => {
      const taskRes = await client.query(
        "SELECT id, tenant_id, lead_id, rep_id, task_type, status, notes, meeting_link, scheduled_time FROM scheduled_tasks WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (taskRes.rows.length === 0) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const task = taskRes.rows[0];

      // Strict Agenda Permission:
      // Only the assigned representative who owns the agenda task can complete or write to it.
      // Level 2, Level 3, and all others have read-only permissions on another rep's task.
      if (task.rep_id && currentUserId && task.rep_id !== currentUserId) {
        return NextResponse.json(
          { error: "Forbidden: Only the assigned representative of this agenda task has write permission." },
          { status: 403 }
        );
      }

      let finalStatus = status || task.status;
      let finalNotes = notes !== undefined ? notes : (remark || task.notes);
      let finalMeetingLink = meetingLink !== undefined ? meetingLink : task.meeting_link;
      let finalScheduledTime = scheduledTime !== undefined
        ? (scheduledTime ? new Date(scheduledTime) : null)
        : task.scheduled_time;

      // Handle specific agenda actions
      if (action === "reschedule") {
        finalStatus = "pending";
        finalNotes = remark ? `Rescheduled: ${remark}` : (notes || task.notes);
      } else if (action === "rnr") {
        finalStatus = "pending";
        finalNotes = remark ? `RNR (Customer Not Picking): ${remark}` : "Customer not answering / unavailable for scheduled meeting";
      } else if (action === "demo_done") {
        finalStatus = "completed";
        finalNotes = remark ? `Demo Done: ${remark}` : "Product demo completed";
      } else if (action === "not_interested") {
        finalStatus = "completed";
        finalNotes = remark ? `Not Interested: ${remark}` : "Customer not interested / cancelled";
      } else if (action === "completed") {
        finalStatus = "completed";
      }

      const updateRes = await client.query(
        `UPDATE scheduled_tasks
         SET status = $1, notes = $2, meeting_link = $3, scheduled_time = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                   task_type as "taskType", scheduled_time as "scheduledTime",
                   meeting_link as "meetingLink", notes, status, updated_at as "updatedAt"`,
        [finalStatus, finalNotes, finalMeetingLink, finalScheduledTime, id]
      );

      const updated = updateRes.rows[0];

      // Ensure stage history table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS lead_stage_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          lead_id UUID NOT NULL,
          rep_id UUID,
          stage_name VARCHAR(100) NOT NULL,
          stage_type VARCHAR(50) NOT NULL,
          notes TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ(6) DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id, created_at DESC);
      `).catch(() => {});

      // 1. Action: Reschedule
      if (action === "reschedule") {
        const stageName = task.task_type === "product_demo" ? "Demo Rescheduled" : "Callback Rescheduled";
        const stageType = task.task_type === "product_demo" ? "demo" : "callback";
        const logRemark = remark
          ? `Rescheduled: ${remark}`
          : `Rescheduled to ${finalScheduledTime ? finalScheduledTime.toLocaleString() : "TBD"}`;

        await client.query(
          `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
           VALUES ($1, $2, $3, $4, 0, $5, NOW())`,
          [tenantId, task.lead_id, task.rep_id, task.task_type === "product_demo" ? "Demo Scheduled" : "Callback", logRemark]
        ).catch(() => {});

        await client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [tenantId, task.lead_id, task.rep_id, stageName, stageType, logRemark, JSON.stringify({ taskId: id, scheduledTime: finalScheduledTime })]
        ).catch(() => {});
      }

      // 2. Action: Customer Not Picking / RNR
      if (action === "rnr") {
        const logRemark = remark
          ? `RNR (Customer Not Picking / Unavailable): ${remark}`
          : "Customer not answering / unavailable for scheduled meeting";

        await client.query(
          `UPDATE leads
           SET status = 'rnr',
               rnr_count = COALESCE(rnr_count, 0) + 1,
               updated_at = NOW()
           WHERE id = $1`,
          [task.lead_id]
        ).catch(() => {});

        await client.query(
          `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
           VALUES ($1, $2, $3, 'RNR', 0, $4, NOW())`,
          [tenantId, task.lead_id, task.rep_id, logRemark]
        ).catch(() => {});

        await client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
           VALUES ($1, $2, $3, 'RNR', 'status', $4, $5, NOW())`,
          [tenantId, task.lead_id, task.rep_id, logRemark, JSON.stringify({ taskId: id, retryTime: finalScheduledTime })]
        ).catch(() => {});
      }

      // 3. Action: Not Interested
      if (action === "not_interested") {
        const logRemark = remark ? `Not Interested: ${remark}` : "Customer not interested / cancelled";

        await client.query(
          `UPDATE leads SET status = 'not_interested', updated_at = NOW() WHERE id = $1`,
          [task.lead_id]
        ).catch(() => {});

        await client.query(
          `UPDATE deals SET stage = 'closed_lost', closing_notes = $1, updated_at = NOW() WHERE lead_id = $2 AND tenant_id = $3`,
          [logRemark, task.lead_id, tenantId]
        ).catch(() => {});

        await client.query(
          `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
           VALUES ($1, $2, $3, 'Not Interested', 0, $4, NOW())`,
          [tenantId, task.lead_id, task.rep_id, logRemark]
        ).catch(() => {});

        await client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
           VALUES ($1, $2, $3, 'Not Interested', 'status', $4, $5, NOW())`,
          [tenantId, task.lead_id, task.rep_id, logRemark, JSON.stringify({ taskId: id })]
        ).catch(() => {});
      }

      // 4. Action: Demo Completed / Done
      if (action === "demo_done" || (task.task_type === "product_demo" && finalStatus === "completed")) {
        const leadRes = await client.query(
          "SELECT id, assigned_rep_id, service_type FROM leads WHERE id = $1",
          [task.lead_id]
        );

        if (leadRes.rows.length > 0) {
          const lead = leadRes.rows[0];
          await client.query(
            "UPDATE leads SET status = 'demo_done', updated_at = NOW() WHERE id = $1",
            [lead.id]
          );

          const dealRes = await client.query(
            "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1",
            [lead.id, tenantId]
          );

          if (dealRes.rows.length > 0) {
            await client.query(
              "UPDATE deals SET stage = 'demo_done', updated_at = NOW() WHERE id = $1",
              [dealRes.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 10000, 0, 'demo_done', 'Product demo completed', NOW(), NOW())`,
              [
                tenantId,
                lead.id,
                lead.assigned_rep_id || task.rep_id,
                lead.service_type || "WhatsApp API",
              ]
            );
          }

          // Check if there is an existing 'Demo Scheduled' call log for this lead.
          // If so, update that log to 'Demo Done' so Call Logs shows ONE at a time instead of duplicate logs!
          const existingDemoLog = await client.query(
            `SELECT id FROM call_logs
             WHERE lead_id = $1 AND disposition = 'Demo Scheduled'
             ORDER BY call_timestamp DESC
             LIMIT 1`,
            [lead.id]
          );

          if (existingDemoLog.rows.length > 0) {
            await client.query(
              `UPDATE call_logs
               SET disposition = 'Demo Done',
                   remark = 'Product demo completed and moved to pipeline.',
                   call_timestamp = NOW()
               WHERE id = $1`,
              [existingDemoLog.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
               VALUES ($1, $2, $3, 'Demo Done', 0, 'Product demo completed and moved to pipeline.', NOW())`,
              [tenantId, lead.id, task.rep_id]
            );
          }

          // Record stage transition in lead_stage_history
          await client.query(`
            CREATE TABLE IF NOT EXISTS lead_stage_history (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              tenant_id UUID NOT NULL,
              lead_id UUID NOT NULL,
              rep_id UUID,
              stage_name VARCHAR(100) NOT NULL,
              stage_type VARCHAR(50) NOT NULL,
              notes TEXT,
              metadata JSONB DEFAULT '{}',
              created_at TIMESTAMPTZ(6) DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id, created_at DESC);
          `).catch(() => {});

          await client.query(
            `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
             VALUES ($1, $2, $3, 'Demo Done', 'demo', 'Product demo completed and moved to pipeline.', $4, NOW())`,
            [
              tenantId,
              lead.id,
              task.rep_id,
              JSON.stringify({ taskId: id, stage: "demo_done" }),
            ]
          ).catch(() => {});

          // Automatically schedule post-demo follow-up callback task so the rep never misses closing follow-up
          const existingPendingCallback = await client.query(
            `SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND task_type = 'callback' AND status = 'pending' LIMIT 1`,
            [lead.id]
          );
          if (existingPendingCallback.rows.length === 0) {
            await client.query(
              `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at)
               VALUES ($1, $2, $3, 'callback', NULL, 'Post-Demo Follow-Up: Client demo completed, call back to close deal.', 'pending', 'dialer', NOW(), NOW())`,
              [tenantId, lead.id, lead.assigned_rep_id || task.rep_id]
            ).catch(() => {});
          }
        }
      }

      return NextResponse.json({ task: updated });
    });
  } catch (error) {
    console.error("[TASKS PATCH]", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
