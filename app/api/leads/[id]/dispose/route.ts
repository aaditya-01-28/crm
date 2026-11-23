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
      logSource = "dialer_web",
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
        case "Already Using: Our Service":
        case "Using Our Service":
        case "Our Service":
          newStatus = "already_using";
          break;
        case "Already Using":
          if (remark && /other|competitor|another|different|rival|compny/i.test(remark)) {
            newStatus = "already_purchased";
          } else {
            newStatus = "already_using";
          }
          break;
        case "Already Purchased":
        case "Already Purchased or Using Other Company Service":
        case "Already Purchased / Using Other Company Service":
        case "Already Purchased / Other Company":
        case "Already Using Other Company Service":
        case "Already Using Other Company":
        case "Already Using Other Service":
        case "Already Using: Other Company Service":
        case "Using Other Service":
        case "Using Other Company":
        case "Other Service":
        case "Other Company":
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

      // Create or update call log: if a call log was recently recorded (e.g. from SIM dialer/telephony),
      // update it with the executive's authoritative disposition and remarks, avoiding duplicate entries.
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;").catch(() => {});
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS log_source TEXT DEFAULT 'dialer_web';").catch(() => {});

      // If disposition is "Demo Done" or "Demo Completed", check if there is an existing "Demo Scheduled" call log
      // for this lead. If so, update that log to "Demo Done" so call logs shows ONE at a time instead of duplicate logs!
      let handledDemoLog = false;
      if (disposition === "Demo Done" || disposition === "Demo Completed") {
        const existingDemoScheduled = await client.query(
          `SELECT id, duration_seconds FROM call_logs
           WHERE lead_id = $1 AND disposition = 'Demo Scheduled'
           ORDER BY call_timestamp DESC
           LIMIT 1`,
          [id]
        );

        if (existingDemoScheduled.rows.length > 0) {
          await client.query(
            `UPDATE call_logs
             SET disposition = 'Demo Done',
                 duration_seconds = GREATEST(duration_seconds, $1),
                 remark = COALESCE($2, 'Product demo completed and moved to pipeline.'),
                 recording_url = COALESCE($3, recording_url),
                 log_source = $4,
                 call_timestamp = NOW()
             WHERE id = $5`,
            [durationSeconds, remark || null, recordingUrl || null, logSource, existingDemoScheduled.rows[0].id]
          );
          handledDemoLog = true;
        }
      }

      if (!handledDemoLog) {
        const recentLog = await client.query(
          `SELECT id, duration_seconds FROM call_logs
           WHERE lead_id = $1 AND rep_id = $2
             AND call_timestamp > NOW() - INTERVAL '3 minutes'
           ORDER BY call_timestamp DESC
           LIMIT 1`,
          [id, repId]
        );

        if (recentLog.rows.length > 0) {
          await client.query(
            `UPDATE call_logs
             SET disposition = $1,
                 duration_seconds = GREATEST(duration_seconds, $2),
                 remark = COALESCE($3, remark),
                 recording_url = COALESCE($4, recording_url),
                 log_source = $5
             WHERE id = $6`,
            [disposition, durationSeconds, remark || null, recordingUrl || null, logSource, recentLog.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, recording_url, log_source, call_timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [tenantId, id, repId, disposition, durationSeconds, remark || null, recordingUrl || null, logSource]
          );
        }
      }

      // Record stage transition into persistent lead_stage_history table
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

      let stageType = "status";
      let stageName = disposition;
      if (disposition === "Demo Scheduled") {
        stageType = "demo";
        stageName = "Demo Scheduled";
      } else if (disposition === "Demo Done" || disposition === "Demo Completed") {
        stageType = "demo";
        stageName = "Demo Done";
      } else if (disposition === "Callback") {
        stageType = "callback";
        stageName = "Callback Requested";
      } else if (newStatus === "already_using") {
        stageName = "Already Using Our Service";
      } else if (newStatus === "already_purchased") {
        stageName = "Using Other Company Service";
      }

      await client.query(
        `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          tenantId,
          id,
          repId,
          stageName,
          stageType,
          remark || null,
          JSON.stringify({
            previousStatus: lead.status,
            newStatus,
            demoDatetime: demoDatetime || null,
            callbackDatetime: callbackDatetime || null,
            decisionMakerName: decisionMakerName || null,
            meetingLink: meetingLink || null,
          }),
        ]
      ).catch(() => {});

      // Synchronize lead status and exact rnr_count from call_logs
      await client.query(
        `UPDATE leads
         SET status = $1,
             rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $2 AND disposition = 'RNR'),
             updated_at = NOW()
         WHERE id = $2`,
        [newStatus, id]
      );

      // Create scheduled task if needed
      // task_source = 'dialer' so Agenda shows these (not 'pipeline' tasks from deal stage changes)
      if (taskToCreate) {
        await client.query(
          `ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS task_source TEXT DEFAULT 'dialer';`
        ).catch(() => {});
        await client.query(
          `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, meeting_link, notes, status, task_source, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'dialer', NOW(), NOW())`,
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
         ORDER BY CASE WHEN l.status = 'new' THEN 0 ELSE 1 END ASC, l.created_at ASC
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
