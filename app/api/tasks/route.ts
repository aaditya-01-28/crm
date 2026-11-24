import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseScheduledDateTime } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");

  const now = new Date();
  // Anchor "Today" to Indian Standard Time (IST, UTC+05:30) so tasks scheduled late evening or early morning stay properly bucketed
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const date = istNow.getUTCDate();

  const startOfDay = new Date(Date.UTC(year, month, date, 0, 0, 0, 0) - IST_OFFSET_MS);
  const endOfDay = new Date(Date.UTC(year, month, date, 23, 59, 59, 999) - IST_OFFSET_MS);

  try {
    return await withClient(async (client) => {
      await client.query("ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS task_source TEXT DEFAULT 'dialer';").catch(() => {});
      const isRep = role === "sales_rep";

      // Issue 6 Fix: Filter out pipeline deal updates from the Follow-Up Agenda
      // Agenda displays only dialer callbacks/demos/follow-ups unless specifically requesting pipeline tasks
      const sourceFilter = source
        ? `AND t.task_source = '${source.replace(/'/g, "''")}'`
        : "AND (t.task_source IS NULL OR t.task_source = 'dialer' OR t.task_source = 'manual')";

      const tasksRes = await client.query(
        `SELECT t.id, t.tenant_id as "tenantId", t.lead_id as "leadId", t.rep_id as "repId",
                t.task_type as "taskType", t.scheduled_time as "scheduledTime", t.status,
                t.meeting_link as "meetingLink", t.notes, COALESCE(t.task_source, 'dialer') as "taskSource",
                t.created_at as "createdAt",
                l.phone_number as "lead_phoneNumber", l.contact_name as "lead_contactName",
                l.company_name as "lead_companyName", l.business_vertical as "lead_businessVertical",
                u.full_name as "rep_fullName"
         FROM scheduled_tasks t
         LEFT JOIN leads l ON t.lead_id = l.id
         LEFT JOIN users u ON t.rep_id = u.id
         WHERE t.tenant_id = $1 AND t.status = 'pending' ${sourceFilter} ${isRep ? "AND (t.rep_id = $2 OR l.assigned_rep_id = $2)" : ""}
         ORDER BY t.scheduled_time ASC NULLS LAST`,
        isRep ? [tenantId, repId] : [tenantId]
      );

      const tasks = tasksRes.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        leadId: r.leadId,
        repId: r.repId,
        taskType: r.taskType,
        scheduledTime: r.scheduledTime,
        status: r.status,
        meetingLink: r.meetingLink,
        notes: r.notes,
        createdAt: r.createdAt,
        lead: {
          id: r.leadId,
          phoneNumber: r.lead_phoneNumber,
          contactName: r.lead_contactName,
          companyName: r.lead_companyName,
          businessVertical: r.lead_businessVertical,
        },
        rep: { id: r.repId, fullName: r.rep_fullName },
      }));

      const unconfirmed = tasks.filter((t) => !t.scheduledTime);
      const scheduled = tasks.filter((t) => t.scheduledTime !== null);

      const overdue = scheduled.filter((t) => new Date(t.scheduledTime!) < startOfDay);
      const today = scheduled.filter(
        (t) => new Date(t.scheduledTime!) >= startOfDay && new Date(t.scheduledTime!) <= endOfDay
      );
      const upcoming = scheduled.filter((t) => new Date(t.scheduledTime!) > endOfDay);

      return NextResponse.json({ unconfirmed, overdue, today, upcoming });
    });
  } catch (error) {
    console.error("[TASKS GET]", error);
    return NextResponse.json({ error: "Failed to retrieve tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    return await withClient(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, meeting_link, notes, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
         RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                   task_type as "taskType", scheduled_time as "scheduledTime",
                   meeting_link as "meetingLink", notes, status, created_at as "createdAt"`,
        [
          tenantId,
          body.leadId,
          repId,
          body.taskType,
          parseScheduledDateTime(body.scheduledTime),
          body.meetingLink || null,
          body.notes || null,
        ]
      );

      return NextResponse.json({ task: insertRes.rows[0] }, { status: 201 });
    });
  } catch (error) {
    console.error("[TASKS POST]", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
