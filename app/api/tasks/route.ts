import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isSalesRep } from "@/lib/rbac";
import { isValidUuid, sanitizeExternalUrl } from "@/lib/security";
import { parseScheduledDateTime, getISTDateRange } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");

  // Anchor "Today" to Indian Standard Time (IST, UTC+05:30) so tasks scheduled late evening or early morning stay properly bucketed
  const { startOfPeriod: startOfDay, endOfPeriod: endOfDay } = getISTDateRange("today");

  try {
    return await withClient(async (client) => {
      const isRep = isSalesRep(role);

      // Agenda displays dialer/manual callbacks & demos, plus pipeline product_demo and callback follow-ups
      const queryParams: any[] = [tenantId];
      let sourceFilter = "AND (t.task_source IS NULL OR t.task_source = 'dialer' OR t.task_source = 'manual' OR (t.task_source = 'pipeline' AND t.task_type IN ('product_demo', 'callback')))";
      if (source) {
        sourceFilter = `AND t.task_source = $${queryParams.push(source)}`;
      }
      let repFilter = "";
      if (isRep) {
        const pRep = queryParams.push(repId);
        repFilter = `AND (t.rep_id = $${pRep} OR l.assigned_rep_id = $${pRep})`;
      }

      const tasksRes = await client.query(
        `SELECT t.id, t.tenant_id as "tenantId", t.lead_id as "leadId", t.rep_id as "repId",
                t.task_type as "taskType", t.scheduled_time as "scheduledTime", t.status,
                t.meeting_link as "meetingLink", t.notes, COALESCE(t.task_source, 'dialer') as "taskSource",
                t.created_at as "createdAt",
                l.phone_number as "lead_phoneNumber", l.contact_name as "lead_contactName",
                l.company_name as "lead_companyName", l.business_vertical as "lead_businessVertical",
                u.full_name as "rep_fullName"
         FROM scheduled_tasks t
         LEFT JOIN leads l ON t.lead_id = l.id AND l.tenant_id = t.tenant_id
         LEFT JOIN users u ON t.rep_id = u.id AND u.tenant_id = t.tenant_id
         WHERE t.tenant_id = $1 AND t.status = 'pending' ${sourceFilter} ${repFilter}
         ORDER BY t.updated_at DESC, t.created_at DESC`,
        queryParams
      );

      // Deduplicate: keep only the most recently updated pending task per lead + type
      const seenLeadTask = new Set<string>();
      const uniqueRows = tasksRes.rows
        .filter((r) => {
          const key = `${r.leadId}_${r.taskType}`;
          if (seenLeadTask.has(key)) return false;
          seenLeadTask.add(key);
          return true;
        })
        .sort((a, b) => {
          if (!a.scheduledTime && !b.scheduledTime) return 0;
          if (!a.scheduledTime) return 1;
          if (!b.scheduledTime) return -1;
          return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
        });
      const tasks = uniqueRows.map((r) => ({
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
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  try {
    const body = await request.json();
    if (!isValidUuid(body.leadId)) {
      return NextResponse.json({ error: "Valid leadId is required" }, { status: 400 });
    }
    if (!body.taskType || typeof body.taskType !== "string") {
      return NextResponse.json({ error: "taskType is required" }, { status: 400 });
    }

    let safeMeetingLink: string | null = null;
    if (body.meetingLink !== undefined && body.meetingLink !== null && String(body.meetingLink).trim() !== "") {
      safeMeetingLink = sanitizeExternalUrl(body.meetingLink);
      if (!safeMeetingLink) {
        return NextResponse.json({ error: "Invalid meetingLink URL" }, { status: 400 });
      }
    }

    return await withClient(async (client) => {
      const leadCheck = await client.query(
        `SELECT id, assigned_rep_id as "assignedRepId" FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [body.leadId, tenantId]
      );
      if (leadCheck.rows.length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      if (isSalesRep(role) && leadCheck.rows[0].assignedRepId !== repId) {
        return NextResponse.json(
          { error: "Forbidden: You can only schedule tasks for your assigned leads." },
          { status: 403 }
        );
      }

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
          safeMeetingLink,
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
