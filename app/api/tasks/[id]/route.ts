import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseScheduledDateTime, formatDateTime } from "@/lib/utils";
import { isManagerOrAdmin } from "@/lib/rbac";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const currentUserId = session.sub;

  try {
    const body = await request.json();
    const { status, notes, meetingLink, scheduledTime, action, remark, durationSeconds = 0, taskType } = body;

    return await withClient(async (client) => {
      const taskRes = await client.query(
        "SELECT id, tenant_id, lead_id, rep_id, task_type, status, notes, meeting_link, scheduled_time FROM scheduled_tasks WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (taskRes.rows.length === 0) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const task = taskRes.rows[0];

      // Permission check:
      // Assigned representative owns completion/outcomes.
      // Level 2 Managers & Level 3 Admins can also edit scheduled time/notes/type (action === "edit_schedule").
      const isEditSchedule = action === "edit_schedule";
      const canManageEdit = isEditSchedule && isManagerOrAdmin(session.role);
      if (!canManageEdit && task.rep_id && currentUserId && task.rep_id !== currentUserId) {
        return NextResponse.json(
          { error: "Forbidden: Only the assigned representative of this agenda task has write permission." },
          { status: 403 }
        );
      }

      let finalStatus = status || task.status;
      let finalNotes = notes !== undefined ? notes : (remark || task.notes);
      let finalMeetingLink = meetingLink !== undefined ? meetingLink : task.meeting_link;
      let finalScheduledTime = scheduledTime !== undefined
        ? parseScheduledDateTime(scheduledTime)
        : task.scheduled_time;

      // Handle specific agenda actions
      if (action === "edit_schedule") {
        finalStatus = task.status;
        finalNotes = notes !== undefined ? notes : (remark !== undefined ? remark : task.notes);
      } else if (action === "reschedule") {
        finalStatus = "pending";
        finalNotes = remark ? `Rescheduled: ${remark}` : (notes || task.notes);
      } else if (action === "rnr") {
        // product_demo RNR → mark task 'rescheduled' (removed from active queue, NOT counted as Done)
        // callback RNR → keep 'pending' so it stays in queue for retry
        finalStatus = task.task_type === "product_demo" ? "rescheduled" : "pending";
        finalNotes = remark ? `RNR (Customer Not Picking): ${remark}` : "Customer not answering / unavailable for scheduled meeting";
      } else if (action === "demo_done") {
        finalStatus = "completed";
        finalNotes = remark ? `Demo Done: ${remark}` : "Product demo completed";
      } else if (action === "not_interested") {
        finalStatus = "cancelled";
        finalNotes = remark ? `Not Interested: ${remark}` : "Customer not interested / cancelled";
      } else if (action === "completed") {
        finalStatus = "completed";
      }

      const finalTaskType = (action === "edit_schedule" && (taskType === "callback" || taskType === "product_demo"))
        ? taskType
        : task.task_type;

      const updateRes = await client.query(
        `UPDATE scheduled_tasks
         SET status = $1, notes = $2, meeting_link = $3, scheduled_time = $4, task_type = $5, updated_at = NOW()
         WHERE id = $6
         RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                   task_type as "taskType", scheduled_time as "scheduledTime",
                   meeting_link as "meetingLink", notes, status, updated_at as "updatedAt"`,
        [finalStatus, finalNotes, finalMeetingLink, finalScheduledTime, finalTaskType, id]
      );

      if (action === "edit_schedule" && scheduledTime !== undefined) {
        const isoVal = finalScheduledTime ? new Date(finalScheduledTime).toISOString() : null;
        await client.query(
          `UPDATE lead_stage_history
           SET metadata = jsonb_set(
                 jsonb_set(COALESCE(metadata, '{}'::jsonb), '{callbackDatetime}', to_jsonb($1::text), true),
                 '{demoDatetime}',
                 to_jsonb($1::text),
                 true
               )
           WHERE lead_id = $2 AND tenant_id = $3 AND (metadata->>'taskId') = $4`,
          [isoVal, task.lead_id, tenantId, id]
        ).catch(() => {});
      }

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
          : `Rescheduled to ${finalScheduledTime ? formatDateTime(finalScheduledTime) : "TBD"}`;

        const leadStatus = task.task_type === "product_demo" ? "demo_scheduled" : "callback";
        await client.query(
          `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`,
          [leadStatus, task.lead_id]
        ).catch(() => {});

        await client.query(
          `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [tenantId, task.lead_id, task.rep_id, task.task_type === "product_demo" ? "Demo Scheduled" : "Callback", durationSeconds || 0, logRemark]
        ).catch(() => {});

        await client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [tenantId, task.lead_id, task.rep_id, stageName, stageType, logRemark, JSON.stringify({ taskId: id, scheduledTime: finalScheduledTime })]
        ).catch(() => {});

        if (task.task_type === "product_demo") {
          const closingNotesJson = JSON.stringify({
            demoDate: finalScheduledTime ? new Date(finalScheduledTime).toISOString() : null,
            meetingLink: task.meeting_link || null,
            notes: finalNotes || logRemark,
          });
          const dealCheck = await client.query(
            "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1",
            [task.lead_id, tenantId]
          );
          if (dealCheck.rows.length > 0) {
            await client.query(
              `UPDATE deals
               SET stage = 'demo_scheduled',
                   closing_notes = $1,
                   updated_at = NOW()
               WHERE id = $2`,
              [closingNotesJson, dealCheck.rows[0].id]
            ).catch(() => {});
          } else {
            await client.query(
              `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
               SELECT tenant_id, id, COALESCE(assigned_rep_id, $2), COALESCE(service_type, 'WhatsApp API'), 0, 0, 'demo_scheduled', $3, NOW(), NOW()
               FROM leads WHERE id = $1`,
              [task.lead_id, task.rep_id, closingNotesJson]
            ).catch(() => {});
          }
        }
      }

      // 2. Action: Customer Not Picking / RNR
      if (action === "rnr") {
        const logRemark = remark
          ? `RNR (Customer Not Picking / Unavailable): ${remark}`
          : "Customer not answering / unavailable for scheduled meeting";

        // Log with actual talk time (durationSeconds from frontend)
        await client.query(
          `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
           VALUES ($1, $2, $3, 'RNR', $4, $5, NOW())`,
          [tenantId, task.lead_id, task.rep_id, durationSeconds || 0, logRemark]
        ).catch(() => {});

        // Update lead status and synchronize exact rnr_count from call_logs
        await client.query(
          `UPDATE leads
           SET status = 'rnr',
               rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1 AND disposition = 'RNR'),
               updated_at = NOW()
           WHERE id = $1`,
          [task.lead_id]
        ).catch(() => {});

        await client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
           VALUES ($1, $2, $3, 'RNR', 'status', $4, $5, NOW())`,
          [tenantId, task.lead_id, task.rep_id, logRemark, JSON.stringify({ taskId: id, retryTime: finalScheduledTime })]
        ).catch(() => {});

        // Create a callback retry task if a scheduled retry time was provided
        // This is the CRITICAL missing piece: after demo RNR, create a callback task in Agenda
        if (finalScheduledTime) {
          // Check for existing pending callback
          const existingCb = await client.query(
            `SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND task_type = 'callback' AND status = 'pending' LIMIT 1`,
            [task.lead_id]
          );
          if (existingCb.rows.length > 0) {
            await client.query(
              `UPDATE scheduled_tasks SET scheduled_time = $1, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3`,
              [finalScheduledTime, logRemark, existingCb.rows[0].id]
            ).catch(() => {});
          } else {
            await client.query(
              `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at)
               VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', 'dialer', NOW(), NOW())`,
              [tenantId, task.lead_id, task.rep_id, finalScheduledTime, logRemark]
            ).catch(() => {});
          }
          // Update lead status to 'callback' since retry is scheduled
          await client.query(
            `UPDATE leads SET status = 'callback', updated_at = NOW() WHERE id = $1`,
            [task.lead_id]
          ).catch(() => {});
        } else {
          // No scheduled time → create a Pending Date Confirmation callback task
          const existingCb = await client.query(
            `SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND task_type = 'callback' AND status = 'pending' LIMIT 1`,
            [task.lead_id]
          );
          if (existingCb.rows.length === 0) {
            await client.query(
              `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at)
               VALUES ($1, $2, $3, 'callback', NULL, $4, 'pending', 'dialer', NOW(), NOW())`,
              [tenantId, task.lead_id, task.rep_id, `${logRemark} [Pending Date Confirmation]`]
            ).catch(() => {});
          }
        }
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
           VALUES ($1, $2, $3, 'Not Interested', $4, $5, NOW())`,
          [tenantId, task.lead_id, task.rep_id, durationSeconds || 0, logRemark]
        ).catch(() => {});

        await client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
           VALUES ($1, $2, $3, 'Not Interested', 'status', $4, $5, NOW())`,
          [tenantId, task.lead_id, task.rep_id, logRemark, JSON.stringify({ taskId: id })]
        ).catch(() => {});
      }

      // 4. Action: Demo Completed / Done
      if (action === "demo_done" || (action !== "rnr" && action !== "not_interested" && action !== "reschedule" && task.task_type === "product_demo" && finalStatus === "completed")) {
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
               VALUES ($1, $2, $3, $4, 0, 0, 'demo_done', 'Product demo completed', NOW(), NOW())`,
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

          const demoLogRemark = remark ? `Demo Done: ${remark}` : "Product demo completed and moved to pipeline.";
          if (existingDemoLog.rows.length > 0) {
            await client.query(
              `UPDATE call_logs
               SET disposition = 'Demo Done',
                   duration_seconds = GREATEST(duration_seconds, $1),
                   remark = $2,
                   call_timestamp = NOW()
               WHERE id = $3`,
              [durationSeconds || 0, demoLogRemark, existingDemoLog.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
               VALUES ($1, $2, $3, 'Demo Done', $4, $5, NOW())`,
              [tenantId, lead.id, task.rep_id, durationSeconds || 0, demoLogRemark]
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
