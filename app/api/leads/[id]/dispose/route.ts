import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseScheduledDateTime } from "@/lib/utils";

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
  const repId = session.sub;

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
      callTimestamp,
      callLogId,
      forceNewLog = false,
      isManualNote = false,
      isInterested = false,
    } = body;

    const isExplicitInterested = Boolean(isInterested) || disposition === "Interested";

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

      // Check whether this lead currently has a pending scheduled product_demo task
      const pendingDemoRes = await client.query(
        `SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'pending' LIMIT 1`,
        [id, tenantId]
      );
      const hasPendingDemo = pendingDemoRes.rows.length > 0;

      let taskToCreate: {
        taskType: string;
        scheduledTime: Date | null;
        meetingLink?: string | null;
        notes?: string | null;
      } | null = null;

      switch (disposition) {
        case "RNR":
          rnrCount += 1;
          if (callbackDatetime) {
            newStatus = "callback";
            taskToCreate = {
              taskType: "callback",
              scheduledTime: parseScheduledDateTime(callbackDatetime),
              notes: remark ? `RNR Retry: ${remark}` : "RNR Retry Callback",
            };
          } else {
            newStatus = "rnr";
            if (hasPendingDemo) {
              taskToCreate = {
                taskType: "callback",
                scheduledTime: null,
                notes: remark
                  ? `Demo RNR Retry: ${remark} [Pending Date Confirmation]`
                  : "Demo RNR Retry Callback [Pending Date Confirmation]",
              };
            }
          }
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
              scheduledTime: parseScheduledDateTime(callbackDatetime),
              notes: remark ? `Future Requirement: ${remark}` : "Future Requirement follow-up",
            };
          }
          break;
        case "Connected":
          newStatus = "callback";
          break;
        case "Interested":
          newStatus = "interested";
          break;
        case "Callback":
          newStatus = "callback";
          taskToCreate = {
            taskType: "callback",
            scheduledTime: parseScheduledDateTime(callbackDatetime),
            notes: remark || null,
          };
          break;
        case "Demo Scheduled":
          newStatus = "demo_scheduled";
          taskToCreate = {
            taskType: "product_demo",
            scheduledTime: parseScheduledDateTime(demoDatetime),
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
          taskToCreate = {
            taskType: "callback",
            scheduledTime: parseScheduledDateTime(callbackDatetime),
            notes: remark
              ? `Post-Demo Follow-Up: ${remark}`
              : "Post-Demo Follow-Up: Client demo completed, call back to close deal.",
          };
          break;
      }

      // Create or update call log: attach disposition and remarks to the call from this active session
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;").catch(() => {});
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS log_source TEXT DEFAULT 'dialer_web';").catch(() => {});
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS is_interested BOOLEAN DEFAULT NULL;").catch(() => {});
      await client.query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_interested BOOLEAN DEFAULT false;").catch(() => {});

      // Attach disposition, notes, and duration to the call from this active session.
      // 1. If explicit callLogId is passed and exists, use it.
      // 2. Otherwise match an un-disposed SIM dialer call (remark = 'Captured from SIM dialer' or log_source IN ('dialer_connected', 'apk_connected')) in the last 30 minutes.
      // 3. Or match close timestamp proximity (+/- 5 minutes) if callTimestamp is provided.
      // 4. Or match a call with matching duration (+/- 3 seconds) in the last 15 minutes.
      // 5. Or any call logged for this lead and rep in the last 10 minutes that was not yet manually disposed with a finalized remark.
      let targetCallId: string | null = null;

      const isUuid = (v: unknown): v is string =>
        typeof v === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

      if (isUuid(callLogId)) {
        const idCheck = await client.query(
          `SELECT id FROM call_logs WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
          [callLogId, tenantId]
        ).catch(() => null);
        if (idCheck && idCheck.rows.length > 0) {
          targetCallId = idCheck.rows[0].id;
        }
      }

      if (!targetCallId && !forceNewLog && !isManualNote) {
        const candidateLogs = await client.query(
          `SELECT id, duration_seconds, remark, log_source, call_timestamp
           FROM call_logs
           WHERE lead_id = $1 AND rep_id = $2 AND tenant_id = $3
             AND call_timestamp >= NOW() - INTERVAL '30 minutes'
             AND (
               -- Only match un-disposed SIM captures waiting for disposition
               remark = 'Captured from SIM dialer'
               OR log_source IN ('dialer_connected', 'apk_connected', 'dialer_rnr')
               OR remark IS NULL
               OR remark = 'na'
               OR remark = ''
             )
           ORDER BY call_timestamp DESC
           LIMIT 1`,
          [id, repId, tenantId]
        );

        if (candidateLogs.rows.length > 0) {
          targetCallId = candidateLogs.rows[0].id;
        }
      }

      if (targetCallId) {
        await client.query(
          `UPDATE call_logs
           SET disposition = $1::varchar,
               duration_seconds = GREATEST(duration_seconds, $2::int),
               remark = COALESCE($3::text, remark),
               recording_url = COALESCE($4::text, recording_url),
               log_source = $5::text,
               is_interested = $6::boolean
           WHERE id = $7::uuid`,
          [disposition, durationSeconds, remark || null, recordingUrl || null, logSource, isExplicitInterested, targetCallId]
        );
      } else {
        const parsedTimestamp = callTimestamp ? parseScheduledDateTime(callTimestamp) : null;
        const finalTimestamp = parsedTimestamp && !isNaN(parsedTimestamp.getTime()) ? parsedTimestamp : new Date();

        await client.query(
          `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, recording_url, log_source, is_interested, call_timestamp)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::varchar, $5::int, $6::text, $7::text, $8::text, $9::boolean, $10::timestamptz)`,
          [tenantId, id, repId, disposition, durationSeconds, remark || null, recordingUrl || null, logSource, isExplicitInterested, finalTimestamp]
        );
      }

      // Immediately clean up any ghost duplicate SIM logs that may have arrived via background sync for this same call interaction
      await client.query(
        `DELETE FROM call_logs
         WHERE lead_id = $1 AND rep_id = $2 AND tenant_id = $3
           AND remark = 'Captured from SIM dialer'
           AND ($4::UUID IS NULL OR id != $4)
           AND ABS(duration_seconds - $5) <= 3
           AND call_timestamp >= NOW() - INTERVAL '30 minutes'`,
        [id, repId, tenantId, targetCallId, durationSeconds]
      ).catch(() => {});

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

      // Update recent stage history only if it was an empty unfinalized draft within 30 seconds (never overwrite existing user notes or different stages)
      const recentStage = (!forceNewLog && !isManualNote)
        ? await client.query(
            `SELECT id FROM lead_stage_history
             WHERE lead_id = $1 AND rep_id = $2 AND tenant_id = $3
               AND created_at >= NOW() - INTERVAL '30 seconds'
               AND (notes IS NULL OR notes = '' OR notes = 'na' OR notes = 'Captured from SIM dialer')
             ORDER BY created_at DESC
             LIMIT 1`,
            [id, repId, tenantId]
          ).catch(() => ({ rows: [] }))
        : { rows: [] };

      const stageMeta = JSON.stringify({
        previousStatus: lead.status,
        newStatus,
        isInterested: isExplicitInterested,
        demoDatetime: demoDatetime || null,
        callbackDatetime: callbackDatetime || null,
        decisionMakerName: decisionMakerName || null,
        meetingLink: meetingLink || null,
      });

      if (recentStage.rows.length > 0) {
        await client.query(
          `UPDATE lead_stage_history
           SET stage_name = $1, stage_type = $2, notes = $3, metadata = $4, created_at = NOW()
           WHERE id = $5`,
          [stageName, stageType, remark || null, stageMeta, recentStage.rows[0].id]
        ).catch(() => {});
      } else {
        await client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [tenantId, id, repId, stageName, stageType, remark || null, stageMeta]
        ).catch(() => {});
      }

      // Synchronize lead status, explicit interested flag, and exact rnr_count from call_logs
      const shouldClearInterested = ["rnr", "not_interested", "invalid", "already_using", "lost"].includes(newStatus);
      await client.query(
        `UPDATE leads
         SET status = $1::varchar,
             is_interested = CASE
               WHEN $3::boolean THEN true
               WHEN $4::boolean THEN false
               ELSE COALESCE(is_interested, false)
             END,
             rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $2::uuid AND disposition = 'RNR'),
             updated_at = NOW()
         WHERE id = $2::uuid`,
        [newStatus, id, isExplicitInterested, shouldClearInterested]
      );

      // Create scheduled task if needed
      // task_source = 'dialer' so Agenda shows these (not 'pipeline' tasks from deal stage changes)
      if (taskToCreate) {
        await client.query(
          `ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS task_source TEXT DEFAULT 'dialer';`
        ).catch(() => {});

        let updatedExistingTask = false;
        if (taskToCreate.taskType === "callback") {
          const existingCb = await client.query(
            `SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND task_type = 'callback' AND status = 'pending' ORDER BY updated_at DESC LIMIT 1`,
            [id]
          );
          if (existingCb.rows.length > 0) {
            updatedExistingTask = true;
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = COALESCE($1, scheduled_time),
                   notes = COALESCE($2, notes),
                   rep_id = COALESCE($3, rep_id),
                   updated_at = NOW()
               WHERE id = $4`,
              [taskToCreate.scheduledTime, taskToCreate.notes, repId, existingCb.rows[0].id]
            );
            // Close any older duplicate pending callback tasks for this same lead
            await client.query(
              `UPDATE scheduled_tasks SET status = 'rescheduled', updated_at = NOW()
               WHERE lead_id = $1 AND task_type = 'callback' AND status = 'pending' AND id <> $2`,
              [id, existingCb.rows[0].id]
            ).catch(() => {});
          }
        } else if (taskToCreate.taskType === "product_demo") {
          // If a pending callback converted to a demo, close out the pending callback
          await client.query(
            `UPDATE scheduled_tasks
             SET status = 'completed',
                 notes = CASE WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' [Converted to Demo]' ELSE 'Converted to Demo Scheduled' END,
                 updated_at = NOW()
             WHERE lead_id = $1 AND task_type = 'callback' AND status = 'pending'`,
            [id]
          ).catch(() => {});

          const existingDemo = await client.query(
            `SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND task_type = 'product_demo' AND status = 'pending' LIMIT 1`,
            [id]
          );
          if (existingDemo.rows.length > 0) {
            updatedExistingTask = true;
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = COALESCE($1, scheduled_time),
                   meeting_link = COALESCE($2, meeting_link),
                   notes = COALESCE($3, notes),
                   updated_at = NOW()
               WHERE id = $4`,
              [taskToCreate.scheduledTime, taskToCreate.meetingLink || null, taskToCreate.notes || null, existingDemo.rows[0].id]
            );
          }
        }

        if (!updatedExistingTask) {
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
      }

      // Complete pending product_demo tasks if demo done
      if (newStatus === "demo_done") {
        await client.query(
          "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND task_type = 'product_demo' AND status = 'pending'",
          [id]
        );
      }

      // If a pending product_demo was called via Dialer/APK and disposed as RNR or Callback,
      // mark the demo task as 'rescheduled' (never 'completed') so Agenda & Demo Done reports stay accurate.
      if (hasPendingDemo && (disposition === "RNR" || disposition === "Callback" || disposition === "Future Requirement")) {
        const rescheduleTag = remark ? `[${disposition}: ${remark}]` : `[${disposition} — Moved to Callback]`;
        await client.query(
          `UPDATE scheduled_tasks
           SET status = 'rescheduled',
               notes = CASE WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' ' || $2 ELSE $2 END,
               updated_at = NOW()
           WHERE lead_id = $1 AND tenant_id = $3 AND task_type = 'product_demo' AND status = 'pending'`,
          [id, rescheduleTag, tenantId]
        ).catch(() => {});
      }

      // Cancel pending product_demo (never mark completed) on disqualified outcomes
      if (
        hasPendingDemo &&
        (disposition === "Not Interested" ||
          disposition === "Invalid" ||
          disposition === "Switched Off" ||
          newStatus === "already_using" ||
          newStatus === "already_purchased")
      ) {
        const cancelTag = remark ? `[Cancelled — ${disposition}: ${remark}]` : `[Cancelled — ${disposition}]`;
        await client.query(
          `UPDATE scheduled_tasks
           SET status = 'cancelled',
               notes = CASE WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' ' || $2 ELSE $2 END,
               updated_at = NOW()
           WHERE lead_id = $1 AND tenant_id = $3 AND task_type = 'product_demo' AND status = 'pending'`,
          [id, cancelTag, tenantId]
        ).catch(() => {});
      }

      // Auto-resolve pending callback tasks on decisive outcomes (NEVER auto-complete pending callbacks on RNR!)
      if (!isManualNote) {
        const shouldAutoCompletePending =
          disposition === "Not Interested" ||
          disposition === "Invalid" ||
          disposition === "Switched Off" ||
          disposition === "Connected" ||
          newStatus === "already_using" ||
          newStatus === "already_purchased" ||
          (disposition === "Future Requirement" && !callbackDatetime);

        if (shouldAutoCompletePending) {
          const resolutionTag = remark
            ? `[Dialer: ${disposition} — ${remark}]`
            : `[Dialer: ${disposition}]`;
          await client.query(
            `UPDATE scheduled_tasks
             SET status = 'completed',
                 notes = CASE
                   WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' ' || $2
                   ELSE $2
                 END,
                 updated_at = NOW()
             WHERE lead_id = $1 AND tenant_id = $3 AND status = 'pending' AND task_type <> 'product_demo'`,
            [id, resolutionTag, tenantId]
          ).catch(() => {});
        }
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

        let closingNotesContent: string;
        if (targetStage === "demo_scheduled") {
          closingNotesContent = JSON.stringify({
            demoDate: taskToCreate?.scheduledTime ? new Date(taskToCreate.scheduledTime).toISOString() : null,
            meetingLink: taskToCreate?.meetingLink || null,
            notes: taskToCreate?.notes || remark || "Product demo scheduled",
          });
        } else if (targetStage === "closed_won") {
          closingNotesContent = "Deal closed won via disposition";
        } else if (targetStage === "closed_lost") {
          closingNotesContent = "Deal marked closed lost via disposition";
        } else if (targetStage === "demo_done") {
          closingNotesContent = "Product demo completed";
        } else {
          closingNotesContent = "Pipeline deal created";
        }

        const dealCheck = await client.query(
          "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1",
          [id, tenantId]
        );

        if (dealCheck.rows.length > 0) {
          await client.query(
            `UPDATE deals
             SET stage = $1,
                 rep_id = COALESCE(rep_id, $2),
                 closing_notes = CASE WHEN $1 = 'demo_scheduled' THEN $3 ELSE closing_notes END,
                 updated_at = NOW()
             WHERE id = $4`,
            [targetStage, lead.assigned_rep_id || repId, closingNotesContent, dealCheck.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 0, 0, $5, $6, NOW(), NOW())`,
            [
              tenantId,
              id,
              lead.assigned_rep_id || repId,
              lead.service_type || "WhatsApp API",
              targetStage,
              closingNotesContent,
            ]
          );
        }
      }

      // Auto-resolve any active push-to-dial job for this rep & lead so the Web Dialer timer stops immediately
      if (!isManualNote) {
        await client.query(
          `UPDATE push_to_dial_jobs
           SET status = 'completed', updated_at = NOW()
           WHERE rep_id = $1 AND lead_id = $2 AND tenant_id = $3
             AND status IN ('pending', 'ringing', 'in_call')`,
          [repId, id, tenantId]
        ).catch(() => {});
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
  } catch (error: any) {
    console.error("[DISPOSE]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to log disposition" },
      { status: 500 }
    );
  }
}
