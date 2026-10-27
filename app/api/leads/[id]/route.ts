import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can, isSalesRep, isAdmin } from "@/lib/rbac";
import { getSession } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isLevel1 = isSalesRep(role);

  try {
    return await withClient(async (client) => {
      const leadRes = await client.query(
        `SELECT l.id, l.tenant_id as "tenantId", l.assigned_rep_id as "assignedRepId",
                l.first_assigned_rep_id as "firstAssignedRepId", l.first_assigned_at as "firstAssignedAt",
                l.phone_number as "phoneNumber", l.contact_name as "contactName",
                l.company_name as "companyName", l.website_url as "websiteUrl",
                l.business_vertical as "businessVertical", l.service_type as "serviceType",
                l.source, l.status, l.rnr_count as "rnrCount", l.custom_metadata as "customMetadata",
                l.created_at as "createdAt", l.updated_at as "updatedAt",
                ar.id as "arId", ar.full_name as "arFullName", ar.email as "arEmail",
                far.id as "farId", far.full_name as "farFullName", far.email as "farEmail"
         FROM leads l
         LEFT JOIN users ar ON l.assigned_rep_id = ar.id
         LEFT JOIN users far ON l.first_assigned_rep_id = far.id
         WHERE l.id = $1 AND l.tenant_id = $2 ${isLevel1 ? "AND l.assigned_rep_id = $3" : ""}`,
        isLevel1 ? [id, tenantId, repId] : [id, tenantId]
      );

      if (leadRes.rows.length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const l = leadRes.rows[0];

      // Call logs: Level 1 sees only their own calls; Level 2 & 3 see all calls
      const callLogsRes = await client.query(
        `SELECT c.id, c.tenant_id as "tenantId", c.lead_id as "leadId", c.rep_id as "repId",
                c.disposition, c.duration_seconds as "durationSeconds", c.remark,
                c.recording_url as "recordingUrl",
                c.call_timestamp as "callTimestamp",
                u.full_name as "repFullName", u.email as "repEmail"
         FROM call_logs c
         LEFT JOIN users u ON c.rep_id = u.id
         WHERE c.lead_id = $1 ${isLevel1 ? "AND c.rep_id = $2" : ""}
         ORDER BY c.call_timestamp DESC`,
        isLevel1 ? [id, repId] : [id]
      );

      const callLogs = callLogsRes.rows.map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        leadId: c.leadId,
        repId: c.repId,
        disposition: c.disposition,
        durationSeconds: c.durationSeconds,
        remark: c.remark,
        recordingUrl: c.recordingUrl || null,
        callTimestamp: c.callTimestamp,
        rep: { fullName: c.repFullName, email: c.repEmail },
      }));

      // Tasks: Level 1 sees only their own tasks; Level 2 & 3 see all tasks
      const tasksRes = await client.query(
        `SELECT t.id, t.tenant_id as "tenantId", t.lead_id as "leadId", t.rep_id as "repId",
                t.task_type as "taskType", t.scheduled_time as "scheduledTime", t.status,
                t.meeting_link as "meetingLink", t.notes, t.created_at as "createdAt",
                u.full_name as "repFullName"
         FROM scheduled_tasks t
         LEFT JOIN users u ON t.rep_id = u.id
         WHERE t.lead_id = $1 ${isLevel1 ? "AND t.rep_id = $2" : ""}
         ORDER BY t.scheduled_time DESC`,
        isLevel1 ? [id, repId] : [id]
      );

      const tasks = tasksRes.rows.map((t) => ({
        ...t,
        rep: { fullName: t.repFullName },
      }));

      // Deals: Level 1 sees only their own deals; Level 2 & 3 see all deals
      const dealsRes = await client.query(
        `SELECT d.id, d.tenant_id as "tenantId", d.lead_id as "leadId", d.rep_id as "repId",
                d.service_type as "serviceType", d.quantity, d.quoted_price as "quotedPrice",
                d.expected_closing_date as "expectedClosingDate", d.stage, d.closing_notes as "closingNotes",
                d.created_at as "createdAt", d.updated_at as "updatedAt",
                u.full_name as "repFullName"
         FROM deals d
         LEFT JOIN users u ON d.rep_id = u.id
         WHERE d.lead_id = $1 ${isLevel1 ? "AND d.rep_id = $2" : ""}
         ORDER BY d.created_at DESC`,
        isLevel1 ? [id, repId] : [id]
      );

      const deals = dealsRes.rows.map((d) => ({
        ...d,
        rep: { fullName: d.repFullName },
        payments: [],
      }));

      const meta = (l.customMetadata as Record<string, unknown>) || {};
      const preferredLanguage = (meta.preferredLanguage as string) || null;

      return NextResponse.json({
        lead: {
          id: l.id,
          tenantId: l.tenantId,
          assignedRepId: l.assignedRepId,
          firstAssignedRepId: isLevel1 ? null : l.firstAssignedRepId,
          firstAssignedAt: isLevel1 ? null : l.firstAssignedAt,
          phoneNumber: l.phoneNumber,
          contactName: l.contactName,
          companyName: l.companyName,
          websiteUrl: l.websiteUrl,
          businessVertical: l.businessVertical,
          serviceType: l.serviceType,
          source: l.source,
          status: l.status,
          rnrCount: l.rnrCount,
          customMetadata: l.customMetadata,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
          assignedRep: l.arId ? { id: l.arId, fullName: l.arFullName, email: l.arEmail } : null,
          firstAssignedRep:
            !isLevel1 && l.farId ? { id: l.farId, fullName: l.farFullName, email: l.farEmail } : null,
          callLogs,
          tasks,
          deals,
          preferredLanguage,
        },
      });
    });
  } catch (error) {
    console.error("[LEAD GET]", error);
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const role = request.headers.get("x-user-role") || session?.role || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  try {
    const body = await request.json();
    const {
      contactName,
      companyName,
      phoneNumber,
      websiteUrl,
      businessVertical,
      serviceType,
      status,
      assignedRepId,
      preferredLanguage,
    } = body;

    const isLevel1 = isSalesRep(role);

    return await withClient(async (client) => {
      const existingRes = await client.query(
        `SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 ${isLevel1 ? "AND assigned_rep_id = $3" : ""}`,
        isLevel1 ? [id, tenantId, repId] : [id, tenantId]
      );

      if (existingRes.rows.length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const existing = existingRes.rows[0];
      const existingMeta = (existing.custom_metadata as Record<string, unknown>) || {};
      const newMetadata = {
        ...existingMeta,
        ...(preferredLanguage !== undefined ? { preferredLanguage: preferredLanguage || null } : {}),
        ...(body.address !== undefined ? { address: body.address || null } : {}),
      };

      const finalAssignedRepId =
        can(role, "leads:assign") && assignedRepId !== undefined
          ? assignedRepId === "" || assignedRepId === "unassigned"
            ? null
            : assignedRepId
          : existing.assigned_rep_id;

      const finalFirstAssignedRepId =
        existing.first_assigned_rep_id ||
        (can(role, "leads:assign") && assignedRepId && assignedRepId !== "unassigned" && assignedRepId !== ""
          ? assignedRepId
          : existing.first_assigned_rep_id);

      const finalFirstAssignedAt =
        existing.first_assigned_at ||
        (!existing.first_assigned_rep_id && can(role, "leads:assign") && assignedRepId && assignedRepId !== "unassigned" && assignedRepId !== ""
          ? new Date()
          : existing.first_assigned_at);

      const isReassigned =
        can(role, "leads:assign") &&
        assignedRepId !== undefined &&
        finalAssignedRepId !== null &&
        finalAssignedRepId !== existing.assigned_rep_id;

      const updateRes = await client.query(
        `UPDATE leads
         SET contact_name = COALESCE($1, contact_name),
             company_name = COALESCE($2, company_name),
             phone_number = COALESCE($3, phone_number),
             website_url = COALESCE($4, website_url),
             business_vertical = COALESCE($5, business_vertical),
             service_type = COALESCE($6, service_type),
             status = CASE WHEN $13 THEN 'new' ELSE COALESCE($7, status) END,
             rnr_count = CASE WHEN $13 THEN 0 ELSE rnr_count END,
             custom_metadata = $8,
             assigned_rep_id = $9,
             first_assigned_rep_id = $10,
             first_assigned_at = $11,
             updated_at = NOW()
         WHERE id = $12
         RETURNING id, tenant_id as "tenantId", assigned_rep_id as "assignedRepId",
                   first_assigned_rep_id as "firstAssignedRepId", first_assigned_at as "firstAssignedAt",
                   phone_number as "phoneNumber", contact_name as "contactName",
                   company_name as "companyName", website_url as "websiteUrl",
                   business_vertical as "businessVertical", service_type as "serviceType",
                   source, status, rnr_count as "rnrCount", custom_metadata as "customMetadata",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [
          contactName !== undefined ? contactName : null,
          companyName !== undefined ? companyName : null,
          phoneNumber !== undefined ? phoneNumber : null,
          websiteUrl !== undefined ? websiteUrl : null,
          businessVertical !== undefined ? businessVertical : null,
          serviceType !== undefined ? serviceType : null,
          status !== undefined ? status : null,
          JSON.stringify(newMetadata),
          finalAssignedRepId,
          finalFirstAssignedRepId,
          finalFirstAssignedAt,
          id,
          isReassigned,
        ]
      );

      const updated = updateRes.rows[0];

      // Auto-sync deal pipeline if status changed to pipeline-relevant stages
      if (
        status === "demo_done" ||
        status === "demo_scheduled" ||
        status === "won" ||
        status === "closed_won" ||
        status === "lost" ||
        status === "closed_lost" ||
        status === "deal_created"
      ) {
        const stageMap: Record<string, string> = {
          demo_scheduled: "demo_scheduled",
          demo_done: "demo_done",
          deal_created: "quote_sent",
          won: "closed_won",
          closed_won: "closed_won",
          lost: "closed_lost",
          closed_lost: "closed_lost",
        };
        const targetStage = stageMap[status] || status;

        const dealCheck = await client.query(
          "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1",
          [id, tenantId]
        );

        if (dealCheck.rows.length > 0) {
          await client.query(
            "UPDATE deals SET stage = $1, rep_id = COALESCE(rep_id, $2), updated_at = NOW() WHERE id = $3",
            [targetStage, updated.assignedRepId || repId, dealCheck.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 10000, 0, $5, $6, NOW(), NOW())`,
            [
              tenantId,
              id,
              updated.assignedRepId || repId,
              updated.serviceType || "WhatsApp API",
              targetStage,
              targetStage === "closed_won"
                ? "Lead converted to Closed Won"
                : targetStage === "closed_lost"
                ? "Lead closed lost"
                : targetStage === "demo_done"
                ? "Product demo completed"
                : "Product demo scheduled",
            ]
          );
        }

        if (status === "demo_done" || status === "won" || status === "closed_won") {
          await client.query(
            "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND task_type = 'product_demo' AND status = 'pending'",
            [id]
          );
        }
      }

      return NextResponse.json({
        lead: {
          ...updated,
          firstAssignedRepId: isLevel1 ? null : updated.firstAssignedRepId,
          firstAssignedAt: isLevel1 ? null : updated.firstAssignedAt,
          preferredLanguage: preferredLanguage || null,
        },
      });
    });
  } catch (error) {
    console.error("[LEAD PATCH]", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 3 Super Admin can delete leads
  if (!isAdmin(role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admins can permanently delete leads." },
      { status: 403 }
    );
  }

  try {
    return await withClient(async (client) => {
      await client.query("BEGIN");
      await client.query("DELETE FROM call_logs WHERE lead_id = $1", [id]);
      await client.query("DELETE FROM scheduled_tasks WHERE lead_id = $1", [id]);
      await client.query("DELETE FROM payments WHERE lead_id = $1", [id]);
      await client.query("DELETE FROM deals WHERE lead_id = $1", [id]);
      const res = await client.query(
        "DELETE FROM leads WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [id, tenantId]
      );
      await client.query("COMMIT");

      if (res.rowCount === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: "Lead permanently deleted.",
      });
    });
  } catch (error) {
    console.error("[LEAD DELETE]", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
