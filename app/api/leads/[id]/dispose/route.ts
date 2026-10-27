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
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      disposition,
      remark,
      callbackDatetime,
      demoDatetime,
      decisionMakerName,
      meetingLink,
      durationSeconds = 0,
      recordingUrl,
    } = body;

    if (!disposition) {
      return NextResponse.json(
        { error: "disposition is required" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      // Validate lead belongs to tenant
      const leadRes = await client.query(
        "SELECT id, status, rnr_count, assigned_rep_id, service_type FROM leads WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (leadRes.rows.length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const lead = leadRes.rows[0];
      let newStatus = lead.status;
      let rnrCount = lead.rnr_count || 0;

      let taskToCreate: {
        taskType: string;
        scheduledTime: Date | null;
        meetingLink?: string | null;
        notes?: string | null;
      } | null = null;

      switch (disposition) {
        case "RNR":
          newStatus = "rnr";
          rnrCount += 1;
          break;
        case "Not Interested":
          newStatus = "not_interested";
          break;
        case "Invalid":
        case "Switched Off":
          newStatus = "invalid";
          break;
        case "Already Using Our Service":
        case "Already Using":
          newStatus = "already_using";
          break;
        case "Already Purchased":
        case "Already Purchased or Using Other Company Service":
        case "Already Purchased / Using Other Company Service":
        case "Already Purchased / Other Company":
          newStatus = "already_purchased";
          break;
        case "Future Requirement":
          newStatus = "future_requirement";
          if (callbackDatetime) {
            taskToCreate = {
              taskType: "callback",
              scheduledTime: new Date(callbackDatetime),
              notes: remark ? `Future Requirement: ${remark}` : "Future Requirement follow-up",
            };
          }
          break;
        case "Connected":
          newStatus = "callback";
          break;
        case "Callback":
          newStatus = "callback";
          taskToCreate = {
            taskType: "callback",
            scheduledTime: callbackDatetime ? new Date(callbackDatetime) : null,
            notes: remark || null,
          };
          break;
        case "Demo Scheduled":
          newStatus = "demo_scheduled";
          taskToCreate = {
            taskType: "product_demo",
            scheduledTime: demoDatetime ? new Date(demoDatetime) : null,
            meetingLink: meetingLink || null,
            notes: [
              decisionMakerName ? `Decision Maker: ${decisionMakerName}` : null,
              remark ? remark : null,
            ]
              .filter(Boolean)
              .join(" | ") || null,
          };
          break;
        case "Demo Done":
        case "Demo Completed":
          newStatus = "demo_done";
          break;
      }

      // Update lead
      await client.query(
        "UPDATE leads SET status = $1, rnr_count = $2, updated_at = NOW() WHERE id = $3",
        [newStatus, rnrCount, id]
      );

      // Create call log
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;").catch(() => {});
      await client.query(
        `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, recording_url, call_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [tenantId, id, repId, disposition, durationSeconds, remark || null, recordingUrl || null]
      );

      // Create scheduled task if needed
      if (taskToCreate) {
        await client.query(
          `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, meeting_link, notes, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())`,
          [
            tenantId,
            id,
            repId,
            taskToCreate.taskType,
            taskToCreate.scheduledTime,
            taskToCreate.meetingLink || null,
            taskToCreate.notes || null,
          ]
        );
      }

      // Complete pending product_demo tasks if demo done
      if (newStatus === "demo_done") {
        await client.query(
          "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND task_type = 'product_demo' AND status = 'pending'",
          [id]
        );
      }

      // Sync Deal Pipeline for pipeline stages
      if (
        newStatus === "demo_scheduled" ||
        newStatus === "demo_done" ||
        newStatus === "won" ||
        newStatus === "lost"
      ) {
        const stageMap: Record<string, string> = {
          demo_scheduled: "demo_scheduled",
          demo_done: "demo_done",
          won: "closed_won",
          lost: "closed_lost",
        };
        const targetStage = stageMap[newStatus] || newStatus;

        const dealCheck = await client.query(
          "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1",
          [id, tenantId]
        );

        if (dealCheck.rows.length > 0) {
          await client.query(
            "UPDATE deals SET stage = $1, rep_id = COALESCE(rep_id, $2), updated_at = NOW() WHERE id = $3",
            [targetStage, lead.assigned_rep_id || repId, dealCheck.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 10000, 0, $5, $6, NOW(), NOW())`,
            [
              tenantId,
              id,
              lead.assigned_rep_id || repId,
              lead.service_type || "WhatsApp API",
              targetStage,
              targetStage === "closed_won"
                ? "Deal closed won via disposition"
                : targetStage === "closed_lost"
                ? "Deal marked closed lost via disposition"
                : targetStage === "demo_done"
                ? "Product demo completed"
                : "Product demo scheduled",
            ]
          );
        }
      }

      // Fetch next queued lead for this rep
      const nextLeadRes = await client.query(
        `SELECT l.id, l.tenant_id as "tenantId", l.assigned_rep_id as "assignedRepId",
                l.phone_number as "phoneNumber", l.contact_name as "contactName",
                l.company_name as "companyName", l.website_url as "websiteUrl",
                l.business_vertical as "businessVertical", l.service_type as "serviceType",
                l.source, l.status, l.rnr_count as "rnrCount", l.custom_metadata as "customMetadata",
                l.created_at as "createdAt", l.updated_at as "updatedAt",
                u.full_name as "assignedRepFullName",
                (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = l.id) as "callLogsCount"
         FROM leads l
         LEFT JOIN users u ON l.assigned_rep_id = u.id
         WHERE l.tenant_id = $1 AND l.assigned_rep_id = $2 AND l.id <> $3
           AND (l.status = 'new' OR (l.status = 'rnr' AND l.rnr_count < 3))
         ORDER BY l.rnr_count ASC, l.created_at ASC
         LIMIT 1`,
        [tenantId, repId, id]
      );

      const nextLead =
        nextLeadRes.rows.length > 0
          ? {
              ...nextLeadRes.rows[0],
              assignedRep: nextLeadRes.rows[0].assignedRepFullName
                ? { fullName: nextLeadRes.rows[0].assignedRepFullName }
                : null,
              _count: { callLogs: nextLeadRes.rows[0].callLogsCount },
            }
          : null;

      return NextResponse.json({ success: true, nextLead });
    });
  } catch (error) {
    console.error("[DISPOSE]", error);
    return NextResponse.json({ error: "Failed to log disposition" }, { status: 500 });
  }
}
