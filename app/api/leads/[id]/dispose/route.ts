import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isSalesRep } from "@/lib/rbac";
import { isValidUuid, sanitizeExternalUrl } from "@/lib/security";
import { parseScheduledDateTime } from "@/lib/utils";

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
  const repId = session.sub;
  const role = session.role;

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
      historicalSync = false,
    } = body;

    const isExplicitInterested = Boolean(isInterested) || disposition === "Interested";

    if (!disposition) {
      return NextResponse.json(
        { error: "disposition is required" },
        { status: 400 }
      );
    }

    let safeMeetingLink: string | null = null;
    if (meetingLink !== undefined && meetingLink !== null && String(meetingLink).trim() !== "") {
      safeMeetingLink = sanitizeExternalUrl(meetingLink);
      if (!safeMeetingLink) {
        return NextResponse.json(
          { error: "Invalid meeting link URL (must use http:// or https://)" },
          { status: 400 }
        );
      }
    }

    const safeRecordingUrl = recordingUrl
      ? sanitizeExternalUrl(recordingUrl, { allowRelative: true })
      : null;

    return await withClient(async (client) => {
      // Validate lead belongs to tenant and caller has access
      const leadRes = await client.query(
        "SELECT id, status, rnr_count, assigned_rep_id, service_type FROM leads WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (leadRes.rows.length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const lead = leadRes.rows[0];
      if (isSalesRep(role) && lead.assigned_rep_id !== repId) {
        return NextResponse.json(
          { error: "Forbidden: You can only log dispositions for leads assigned to you." },
          { status: 403 }
        );
      }
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
            meetingLink: safeMeetingLink,
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

      // Attach disposition, notes, and duration to the call from this active session.
      let targetCallId: string | null = null;

      if (isValidUuid(callLogId)) {
        const idCheck = await client.query(
          `SELECT id FROM call_logs WHERE id = $1::uuid AND lead_id = $2::uuid AND tenant_id = $3::uuid LIMIT 1`,
          [callLogId, id, tenantId]
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

      const parsedTimestamp = callTimestamp ? parseScheduledDateTime(callTimestamp) : null;
      const finalTimestamp = parsedTimestamp && !isNaN(parsedTimestamp.getTime()) ? parsedTimestamp : new Date();
      const isAutoLoggedSkip = typeof remark === "string" && /auto-logged/i.test(remark);

      if (isAutoLoggedSkip) {
        const manualDupCheck = await client.query(
          `SELECT id FROM call_logs
           WHERE lead_id = $1 AND rep_id = $2 AND tenant_id = $3
             AND call_timestamp >= ($4::TIMESTAMPTZ - INTERVAL '5 minutes')
             AND call_timestamp <= ($4::TIMESTAMPTZ + INTERVAL '5 minutes')
             AND ABS(duration_seconds - $5) <= 3
             AND (remark IS DISTINCT FROM 'Captured from SIM dialer')
           LIMIT 1`,
          [id, repId, tenantId, finalTimestamp, durationSeconds]
        ).catch(() => ({ rows: [] }));

        if (manualDupCheck.rows.length > 0) {
          return NextResponse.json({
            success: true,
            deduplicated: true,
            lead: { id, status: lead.status, rnrCount },
          });
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
           WHERE id = $7::uuid AND tenant_id = $8::uuid`,
          [disposition, durationSeconds, remark || null, safeRecordingUrl, logSource, isExplicitInterested, targetCallId, tenantId]
        );
      } else {
        await client.query(
          `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, recording_url, log_source, is_interested, call_timestamp)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::varchar, $5::int, $6::text, $7::text, $8::text, $9::boolean, $10::timestamptz)`,
          [tenantId, id, repId, disposition, durationSeconds, remark || null, safeRecordingUrl, logSource, isExplicitInterested, finalTimestamp]
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
        meetingLink: safeMeetingLink,
      });

      if (recentStage.rows.length > 0) {
        await client.query(
          `UPDATE lead_stage_history
           SET stage_name = $1, stage_type = $2, notes = $3, metadata = $4, created_at = NOW()
           WHERE id = $5 AND tenant_id = $6`,
          [stageName, stageType, remark || null, stageMeta, recentStage.rows[0].id, tenantId]
        ).catch(() => {});
      } else {
        await client.query(
          `INSERT INTO lead_stage_history (tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, id, repId, stageName, stageType, remark || null, stageMeta, historicalSync ? finalTimestamp : new Date()]
        ).catch(() => {});
      }

      // Check if this is a backdated historical phone log older than an already logged call on a progressed lead
      const latestOtherCallRes = historicalSync
        ? await client.query(
            `SELECT MAX(call_timestamp) as "latestTs" FROM call_logs WHERE lead_id = $1 AND tenant_id = $2 AND ($3::uuid IS NULL OR id <> $3)`,
            [id, tenantId, targetCallId]
          ).catch(() => ({ rows: [] }))
        : { rows: [] };
      const latestOtherTs = latestOtherCallRes.rows[0]?.latestTs
        ? new Date(latestOtherCallRes.rows[0].latestTs).getTime()
        : 0;
      const curStatusLower = String(lead.status || "").toLowerCase();
      const preserveNewerLeadState =
        Boolean(historicalSync) &&
        latestOtherTs > 0 &&
        finalTimestamp.getTime() < latestOtherTs &&
        curStatusLower !== "new" &&
        curStatusLower !== "uncontacted";

      // Synchronize lead status, explicit interested flag, and exact rnr_count from call_logs
      if (preserveNewerLeadState) {
        await client.query(
          `UPDATE leads
           SET rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1::uuid AND tenant_id = $2::uuid AND disposition = 'RNR'),
               updated_at = NOW()
           WHERE id = $1::uuid AND tenant_id = $2::uuid`,
          [id, tenantId]
        );
      } else {
        const shouldClearInterested = ["rnr", "not_interested", "invalid", "already_using", "lost"].includes(newStatus);
        await client.query(
          `UPDATE leads
           SET status = $1::varchar,
               is_interested = CASE
                 WHEN $3::boolean THEN true
                 WHEN $4::boolean THEN false
                 ELSE COALESCE(is_interested, false)
               END,
               rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $2::uuid AND tenant_id = $5::uuid AND disposition = 'RNR'),
               updated_at = NOW()
           WHERE id = $2::uuid AND tenant_id = $5::uuid`,
          [newStatus, id, isExplicitInterested, shouldClearInterested, tenantId]
        );
      }

      // Create scheduled task if needed
      // task_source = 'dialer' so Agenda shows these (not 'pipeline' tasks from deal stage changes)
      if (!preserveNewerLeadState && taskToCreate) {
        let updatedExistingTask = false;
        if (taskToCreate.taskType === "callback") {
          const existingCb = await client.query(
            `SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'callback' AND status = 'pending' ORDER BY updated_at DESC LIMIT 1`,
            [id, tenantId]
          );
          if (existingCb.rows.length > 0) {
            updatedExistingTask = true;
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = COALESCE($1, scheduled_time),
                   notes = COALESCE($2, notes),
                   rep_id = COALESCE($3, rep_id),
                   updated_at = NOW()
               WHERE id = $4 AND tenant_id = $5`,
              [taskToCreate.scheduledTime, taskToCreate.notes, repId, existingCb.rows[0].id, tenantId]
            );
            // Close any older duplicate pending callback tasks for this same lead
            await client.query(
              `UPDATE scheduled_tasks SET status = 'rescheduled', updated_at = NOW()
               WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'callback' AND status = 'pending' AND id <> $3`,
              [id, tenantId, existingCb.rows[0].id]
            ).catch(() => {});
          }
        } else if (taskToCreate.taskType === "product_demo") {
          // If a pending callback converted to a demo, close out the pending callback
          await client.query(
            `UPDATE scheduled_tasks
             SET status = 'completed',
                 notes = CASE WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' [Converted to Demo]' ELSE 'Converted to Demo Scheduled' END,
                 updated_at = NOW()
             WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'callback' AND status = 'pending'`,
            [id, tenantId]
          ).catch(() => {});

          const existingDemo = await client.query(
            `SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'pending' LIMIT 1`,
            [id, tenantId]
          );
          if (existingDemo.rows.length > 0) {
            updatedExistingTask = true;
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = COALESCE($1, scheduled_time),
                   meeting_link = COALESCE($2, meeting_link),
                   notes = COALESCE($3, notes),
                   updated_at = NOW()
               WHERE id = $4 AND tenant_id = $5`,
              [taskToCreate.scheduledTime, taskToCreate.meetingLink || null, taskToCreate.notes || null, existingDemo.rows[0].id, tenantId]
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
      if (!preserveNewerLeadState && newStatus === "demo_done") {
        await client.query(
          "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'pending'",
          [id, tenantId]
        );
      }

      // If a pending product_demo was called via Dialer/APK and disposed as RNR or Callback,
      // mark the demo task as 'rescheduled' (never 'completed') so Agenda & Demo Done reports stay accurate.
      if (!preserveNewerLeadState && hasPendingDemo && (disposition === "RNR" || disposition === "Callback" || disposition === "Future Requirement")) {
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
        !preserveNewerLeadState &&
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

      // Auto-resolve pending callback tasks on decisive outcomes, and clear overdue callbacks when attempted (e.g. RNR)
      if (!preserveNewerLeadState && !isManualNote) {
        const shouldAutoCompletePending =
          disposition === "Not Interested" ||
          disposition === "Invalid" ||
          disposition === "Switched Off" ||
          disposition === "Connected" ||
          disposition === "Demo Done" ||
          disposition === "Demo Completed" ||
          (disposition === "Interested" && !callbackDatetime) ||
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
        } else if (disposition === "RNR" && !callbackDatetime) {
          // If an overdue/due callback was attempted today and disposed as RNR, mark that overdue callback completed so it leaves Overdue
          const attemptTag = remark
            ? `[Attempted: RNR — ${remark}]`
            : `[Attempted: RNR]`;
          await client.query(
            `UPDATE scheduled_tasks
             SET status = 'completed',
                 notes = CASE
                   WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' ' || $2
                   ELSE $2
                 END,
                 updated_at = NOW()
             WHERE lead_id = $1 AND tenant_id = $3 AND task_type = 'callback' AND status = 'pending'
               AND scheduled_time IS NOT NULL AND scheduled_time <= NOW()`,
            [id, attemptTag, tenantId]
          ).catch(() => {});
        }
      }

      // Sync Deal Pipeline for pipeline stages
      if (
        !preserveNewerLeadState &&
        (newStatus === "demo_scheduled" ||
          newStatus === "demo_done" ||
          newStatus === "won" ||
          newStatus === "lost")
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
             WHERE id = $4 AND tenant_id = $5`,
            [targetStage, lead.assigned_rep_id || repId, closingNotesContent, dealCheck.rows[0].id, tenantId]
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
      { error: "Failed to log disposition" },
      { status: 500 }
    );
  }
}
