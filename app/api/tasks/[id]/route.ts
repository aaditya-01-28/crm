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

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { status, notes, meetingLink, scheduledTime } = body;

    return await withClient(async (client) => {
      const taskRes = await client.query(
        "SELECT id, tenant_id, lead_id, rep_id, task_type, status, notes, meeting_link, scheduled_time FROM scheduled_tasks WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (taskRes.rows.length === 0) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const task = taskRes.rows[0];
      const newStatus = status || task.status;
      const newNotes = notes !== undefined ? notes : task.notes;
      const newMeetingLink = meetingLink !== undefined ? meetingLink : task.meeting_link;
      const newScheduledTime = scheduledTime ? new Date(scheduledTime) : task.scheduled_time;

      const updateRes = await client.query(
        `UPDATE scheduled_tasks
         SET status = $1, notes = $2, meeting_link = $3, scheduled_time = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                   task_type as "taskType", scheduled_time as "scheduledTime",
                   meeting_link as "meetingLink", notes, status, updated_at as "updatedAt"`,
        [newStatus, newNotes, newMeetingLink, newScheduledTime, id]
      );

      const updated = updateRes.rows[0];

      // If a product_demo task was marked completed, sync pipeline to 'demo_done'
      if (task.task_type === "product_demo" && status === "completed") {
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

          await client.query(
            `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
             VALUES ($1, $2, $3, 'Demo Done', 0, 'Product demo completed and moved to pipeline.', NOW())`,
            [tenantId, lead.id, task.rep_id]
          );
        }
      }

      return NextResponse.json({ task: updated });
    });
  } catch (error) {
    console.error("[TASKS PATCH]", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
