import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can, isSalesRep, isAdmin } from "@/lib/rbac";
import { requireActiveSession } from "@/lib/auth";
import { isValidUuid, sanitizeExternalUrl } from "@/lib/security";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  const isLevel1 = isSalesRep(role);

  try {
    return await withClient(async (client) => {
      const leadRes = await client.query(
        `SELECT l.id, l.tenant_id as "tenantId", l.assigned_rep_id as "assignedRepId",
                COALESCE(l.assigned_at, l.first_assigned_at, (CASE WHEN l.assigned_rep_id IS NOT NULL THEN l.created_at ELSE NULL END)) as "assignedAt",
                l.first_assigned_rep_id as "firstAssignedRepId", l.first_assigned_at as "firstAssignedAt",
                l.phone_number as "phoneNumber", l.contact_name as "contactName",
                l.company_name as "companyName", l.website_url as "websiteUrl",
                l.business_vertical as "businessVertical", l.service_type as "serviceType",
                l.source, l.status,
                COALESCE((SELECT COUNT(*)::int FROM call_logs WHERE lead_id = l.id AND tenant_id = l.tenant_id AND disposition = 'RNR'), l.rnr_count, 0) as "rnrCount",
                l.custom_metadata as "customMetadata",
                l.created_at as "createdAt", l.updated_at as "updatedAt",
                ar.id as "arId", ar.full_name as "arFullName", ar.email as "arEmail",
                far.id as "farId", far.full_name as "farFullName", far.email as "farEmail"
         FROM leads l
         LEFT JOIN users ar ON l.assigned_rep_id = ar.id AND ar.tenant_id = l.tenant_id
         LEFT JOIN users far ON l.first_assigned_rep_id = far.id AND far.tenant_id = l.tenant_id
         WHERE l.id = $1 AND l.tenant_id = $2 ${isLevel1 ? "AND l.assigned_rep_id = $3" : ""}`,
        isLevel1 ? [id, tenantId, repId] : [id, tenantId]
      );

      if (leadRes.rows.length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const l = leadRes.rows[0];

      // Call logs: Level 1 sees only their own calls; Level 2 & 3 see all calls within tenant
      const callLogsRes = await client.query(
        `SELECT c.id, c.tenant_id as "tenantId", c.lead_id as "leadId", c.rep_id as "repId",
                c.disposition, c.duration_seconds as "durationSeconds", c.remark,
                c.recording_url as "recordingUrl",
                COALESCE(c.is_interested, false) as "isInterested",
                c.call_timestamp as "callTimestamp",
                u.full_name as "repFullName", u.email as "repEmail"
         FROM call_logs c
         LEFT JOIN users u ON c.rep_id = u.id AND u.tenant_id = c.tenant_id
         WHERE c.lead_id = $1 AND c.tenant_id = $2 ${isLevel1 ? "AND c.rep_id = $3" : ""}
         ORDER BY c.call_timestamp DESC`,
        isLevel1 ? [id, tenantId, repId] : [id, tenantId]
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
        isInterested: Boolean(c.isInterested),
        callTimestamp: c.callTimestamp,
        rep: { fullName: c.repFullName, email: c.repEmail },
      }));

      // Tasks: Level 1 sees only their own tasks; Level 2 & 3 see all tasks within tenant
      const tasksRes = await client.query(
        `SELECT t.id, t.tenant_id as "tenantId", t.lead_id as "leadId", t.rep_id as "repId",
                t.task_type as "taskType", t.scheduled_time as "scheduledTime", t.status,
                t.meeting_link as "meetingLink", t.notes, t.created_at as "createdAt",
                t.updated_at as "updatedAt",
                u.full_name as "repFullName"
         FROM scheduled_tasks t
         LEFT JOIN users u ON t.rep_id = u.id AND u.tenant_id = t.tenant_id
         WHERE t.lead_id = $1 AND t.tenant_id = $2 ${isLevel1 ? "AND t.rep_id = $3" : ""}
         ORDER BY t.scheduled_time DESC`,
        isLevel1 ? [id, tenantId, repId] : [id, tenantId]
      );

      const tasks = tasksRes.rows.map((t) => ({
        ...t,
        rep: { fullName: t.repFullName },
      }));

      // Deals: Level 1 sees only their own deals; Level 2 & 3 see all deals within tenant
      const dealsRes = await client.query(
        `SELECT d.id, d.tenant_id as "tenantId", d.lead_id as "leadId", d.rep_id as "repId",
                d.service_type as "serviceType", d.quantity, d.quoted_price as "quotedPrice",
                d.expected_closing_date as "expectedClosingDate", d.stage, d.closing_notes as "closingNotes",
                d.created_at as "createdAt", d.updated_at as "updatedAt",
                u.full_name as "repFullName"
         FROM deals d
         LEFT JOIN users u ON d.rep_id = u.id AND u.tenant_id = d.tenant_id
         WHERE d.lead_id = $1 AND d.tenant_id = $2 ${isLevel1 ? "AND d.rep_id = $3" : ""}
         ORDER BY d.created_at DESC`,
        isLevel1 ? [id, tenantId, repId] : [id, tenantId]
      );

      const deals = dealsRes.rows.map((d) => ({
        ...d,
        rep: { fullName: d.repFullName },
        payments: [],
      }));

      const stageHistoryRes = await client.query(
        `SELECT h.id, h.tenant_id as "tenantId", h.lead_id as "leadId", h.rep_id as "repId",
                h.stage_name as "stageName", h.stage_type as "stageType", h.notes,
                h.metadata, h.created_at as "createdAt",
                u.full_name as "repFullName"
         FROM lead_stage_history h
         LEFT JOIN users u ON h.rep_id = u.id AND u.tenant_id = h.tenant_id
         WHERE h.lead_id = $1 AND h.tenant_id = $2
         ORDER BY h.created_at DESC`,
        [id, tenantId]
      ).catch(() => ({ rows: [] }));

      const stageHistory = stageHistoryRes.rows.map((h: any) => ({
        id: h.id,
        tenantId: h.tenantId,
        leadId: h.leadId,
        repId: h.repId,
        stageName: h.stageName,
        stageType: h.stageType,
        notes: h.notes,
        metadata: h.metadata,
        createdAt: h.createdAt,
        rep: { fullName: h.repFullName },
      }));

      const meta = (l.customMetadata as Record<string, unknown>) || {};
      const preferredLanguage = (meta.preferredLanguage as string) || null;

      return NextResponse.json({
        lead: {
          id: l.id,
          tenantId: l.tenantId,
          assignedRepId: l.assignedRepId,
          assignedAt: l.assignedAt,
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
          stageHistory,
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
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  }
  const tenantId = session.tenantId;
  const role = session.role;
  const repId = session.sub;

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
    if (isLevel1 && (status === "won" || status === "closed_won")) {
      return NextResponse.json(
        { error: "Forbidden: Sales representatives cannot mark leads as Won directly. Submit a deal for Operations approval." },
        { status: 403 }
      );
    }

    let normalizedWebsite: string | null | undefined = undefined;
    if (websiteUrl !== undefined) {
      if (!websiteUrl || !String(websiteUrl).trim()) {
        normalizedWebsite = null;
      } else {
        const trimmedSite = String(websiteUrl).trim();
        const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedSite)
          ? trimmedSite
          : `https://${trimmedSite}`;
        const validated = sanitizeExternalUrl(candidate);
        if (!validated) {
          return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
        }
        normalizedWebsite = validated;
      }
    }

    if (can(role, "leads:assign") && assignedRepId !== undefined && assignedRepId !== "" && assignedRepId !== "unassigned") {
      if (!isValidUuid(assignedRepId)) {
        return NextResponse.json({ error: "Invalid assignedRepId" }, { status: 400 });
      }
    }

    return await withClient(async (client) => {
      if (can(role, "leads:assign") && assignedRepId && assignedRepId !== "unassigned") {
        const targetRepCheck = await client.query(
          `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1`,
          [assignedRepId.trim(), tenantId]
        );
        if (targetRepCheck.rows.length === 0) {
          return NextResponse.json(
            { error: "Selected representative not found or inactive in workspace." },
            { status: 400 }
          );
        }
      }

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
        ...(body.secondaryPhone !== undefined ? { secondaryPhone: body.secondaryPhone || null } : {}),
        ...(body.secondaryPhoneType !== undefined ? { secondaryPhoneType: body.secondaryPhoneType || "both" } : {}),
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
         SET contact_name = $1,
             company_name = $2,
             phone_number = $3,
             website_url = $4,
             business_vertical = $5,
             service_type = $6,
             status = CASE WHEN $13::boolean THEN 'new' ELSE $7 END,
             rnr_count = CASE WHEN $13::boolean THEN 0 ELSE rnr_count END,
             custom_metadata = $8::jsonb,
             assigned_rep_id = $9::uuid,
             assigned_at = CASE 
               WHEN $13::boolean THEN NOW() 
               WHEN $9::uuid IS NOT NULL AND assigned_at IS NULL THEN NOW() 
               WHEN $9::uuid IS NULL THEN NULL 
               ELSE assigned_at 
             END,
             first_assigned_rep_id = $10::uuid,
             first_assigned_at = $11::timestamptz,
             updated_at = NOW()
         WHERE id = $12::uuid AND tenant_id = $14::uuid
         RETURNING id, tenant_id as "tenantId", assigned_rep_id as "assignedRepId",
                   COALESCE(assigned_at, first_assigned_at, (CASE WHEN assigned_rep_id IS NOT NULL THEN created_at ELSE NULL END)) as "assignedAt",
                   first_assigned_rep_id as "firstAssignedRepId", first_assigned_at as "firstAssignedAt",
                   phone_number as "phoneNumber", contact_name as "contactName",
                   company_name as "companyName", website_url as "websiteUrl",
                   business_vertical as "businessVertical", service_type as "serviceType",
                   source, status, rnr_count as "rnrCount", custom_metadata as "customMetadata",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [
          contactName !== undefined ? (contactName || null) : existing.contact_name,
          companyName !== undefined ? (companyName || null) : existing.company_name,
          phoneNumber !== undefined && phoneNumber.trim() !== "" ? phoneNumber.trim() : existing.phone_number,
          websiteUrl !== undefined ? normalizedWebsite : existing.website_url,
          businessVertical !== undefined ? (businessVertical || null) : existing.business_vertical,
          serviceType !== undefined ? (serviceType || null) : existing.service_type,
          status !== undefined && status !== null && status !== "" ? status : (existing.status || "new"),
          JSON.stringify(newMetadata),
          finalAssignedRepId || null,
          finalFirstAssignedRepId || null,
          finalFirstAssignedAt || null,
          id,
          Boolean(isReassigned),
          tenantId,
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

        const dealRepId = updated.assignedRepId || repId || existing.assigned_rep_id || null;

        if (dealRepId) {
          if (dealCheck.rows.length > 0) {
            await client.query(
              "UPDATE deals SET stage = $1, rep_id = COALESCE(rep_id, $2), updated_at = NOW() WHERE id = $3 AND tenant_id = $4",
              [targetStage, dealRepId, dealCheck.rows[0].id, tenantId]
            );
          } else {
            await client.query(
              `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 0, 0, $5, $6, NOW(), NOW())`,
              [
                tenantId,
                id,
                dealRepId,
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
        }

        if (status === "demo_done" || status === "won" || status === "closed_won") {
          await client.query(
            "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'pending'",
            [id, tenantId]
          );
        }
      }

      return NextResponse.json({
        lead: {
          ...updated,
          firstAssignedRepId: isLevel1 ? null : updated.firstAssignedRepId,
          firstAssignedAt: isLevel1 ? null : updated.firstAssignedAt,
          preferredLanguage: (newMetadata.preferredLanguage as string) || null,
          customMetadata: newMetadata,
        },
      });
    });
  } catch (error: any) {
    console.error("[LEAD PATCH]", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const role = session.role;

  // Only Level 3 Super Admin can delete leads
  if (!isAdmin(role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admins can permanently delete leads." },
      { status: 403 }
    );
  }

  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const ownedRes = await client.query(
          "SELECT id FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1",
          [id, tenantId]
        );
        if (ownedRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }

        await client.query("DELETE FROM call_logs WHERE lead_id = $1 AND tenant_id = $2", [id, tenantId]);
        await client.query("DELETE FROM scheduled_tasks WHERE lead_id = $1 AND tenant_id = $2", [id, tenantId]);
        await client.query("DELETE FROM payments WHERE lead_id = $1 AND tenant_id = $2", [id, tenantId]);
        await client.query("DELETE FROM deals WHERE lead_id = $1 AND tenant_id = $2", [id, tenantId]);
        await client.query("DELETE FROM lead_stage_history WHERE lead_id = $1 AND tenant_id = $2", [id, tenantId]).catch(() => {});
        await client.query("DELETE FROM push_to_dial_jobs WHERE lead_id = $1 AND tenant_id = $2", [id, tenantId]).catch(() => {});
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
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[LEAD DELETE]", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
