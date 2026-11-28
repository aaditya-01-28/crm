import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isSalesRep } from "@/lib/rbac";
import { escapeLikePattern, isValidUuid, sanitizeExternalUrl } from "@/lib/security";
import { getISTDateRange, interestedCallSql } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;
  const { searchParams } = new URL(request.url);

  const leadId = searchParams.get("leadId");
  const filterRepId = searchParams.get("repId");
  const disposition = searchParams.get("disposition");
  const search = searchParams.get("search")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const offset = (page - 1) * limit;

  if (leadId && !isValidUuid(leadId)) {
    return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
  }
  if (filterRepId && filterRepId !== "all" && !isValidUuid(filterRepId)) {
    return NextResponse.json({ error: "Invalid repId" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      const conditions: string[] = [
        "c.tenant_id = $1",
        "COALESCE(c.log_source, 'dialer_web') <> 'sheet_import'",
      ];
      const params: any[] = [tenantId];

      if (isSalesRep(role)) {
        conditions.push(`c.rep_id = $${params.push(repId)}`);
      } else if (filterRepId && filterRepId !== "all") {
        conditions.push(`c.rep_id = $${params.push(filterRepId)}`);
      }

      if (leadId) {
        conditions.push(`c.lead_id = $${params.push(leadId)}`);
      }

      if (disposition && disposition !== "all") {
        if (disposition === "Interested" || disposition === "interested") {
          conditions.push(interestedCallSql("c"));
        } else if (disposition === "Connected" || disposition === "connected") {
          conditions.push(
            `(c.disposition NOT IN ('RNR', 'Ringing No Response', 'Ring No Response', 'Invalid') AND (c.duration_seconds > 0 OR c.disposition IN ('Connected', 'Interested', 'Contacted', 'Answered', 'Callback', 'Callback Requested', 'Demo Scheduled', 'Demo Done', 'Demo Completed', 'Already Using Our Service', 'Already Purchased or Using Other Company Service', 'Not Interested', 'Future Requirement')))`
          );
        } else if (
          disposition === "RNR" ||
          disposition === "Ringing No Response" ||
          disposition === "Ring No Response"
        ) {
          conditions.push(
            `(c.disposition IN ('RNR', 'Ringing No Response', 'Ring No Response') OR c.disposition ILIKE '%Ringing%' OR c.disposition ILIKE '%No Response%' OR c.disposition ILIKE '%No Answer%')`
          );
        } else if (disposition === "RNR1" || disposition === "rnr_1") {
          conditions.push(`rn.rnr_attempt = 1`);
        } else if (disposition === "RNR2" || disposition === "rnr_2") {
          conditions.push(`rn.rnr_attempt = 2`);
        } else if (disposition === "RNR3" || disposition === "rnr_3") {
          conditions.push(`rn.rnr_attempt = 3`);
        } else if (disposition === "RNR4" || disposition === "rnr_4") {
          conditions.push(`rn.rnr_attempt >= 4`);
        } else if (disposition === "Callback" || disposition === "Callback Requested") {
          conditions.push(`(c.disposition = 'Callback' OR c.disposition ILIKE '%Callback%')`);
        } else if (
          disposition === "Already Using Our Service" ||
          disposition === "Already Using" ||
          disposition === "Using Our Service"
        ) {
          conditions.push(`(c.disposition = 'Already Using Our Service' OR c.disposition = 'Already Using' OR c.disposition = 'Using Our Service')`);
        } else if (
          disposition === "Already Purchased or Using Other Company Service" ||
          disposition === "Already Purchased" ||
          disposition === "Using Other Service" ||
          disposition === "Already Using Other Company"
        ) {
          conditions.push(`(c.disposition ILIKE '%Other%' OR c.disposition ILIKE '%Purchased%')`);
        } else if (disposition === "Demo Done" || disposition === "Demo Completed") {
          conditions.push(`(c.disposition = 'Demo Done' OR c.disposition = 'Demo Completed' OR c.disposition ILIKE '%Demo Done%' OR c.disposition ILIKE '%Demo Completed%')`);
        } else if (disposition === "Demo Scheduled") {
          conditions.push(`(c.disposition = 'Demo Scheduled' OR c.disposition ILIKE '%Demo Scheduled%')`);
        } else if (disposition === "Not Interested") {
          conditions.push(`(c.disposition = 'Not Interested' OR c.disposition ILIKE '%Not Interested%')`);
        } else if (disposition === "Future Requirement") {
          conditions.push(`(c.disposition = 'Future Requirement' OR c.disposition ILIKE '%Future%')`);
        } else if (disposition === "Invalid") {
          conditions.push(`(c.disposition = 'Invalid' OR c.disposition ILIKE '%Invalid%')`);
        } else {
          conditions.push(`c.disposition = $${params.push(disposition)}`);
        }
      }

      if (dateFrom) {
        const { startOfPeriod } = getISTDateRange("custom", dateFrom, null);
        conditions.push(`c.call_timestamp >= $${params.push(startOfPeriod)}`);
      }
      if (dateTo) {
        const { endOfPeriod } = getISTDateRange("custom", null, dateTo);
        conditions.push(`c.call_timestamp <= $${params.push(endOfPeriod)}`);
      }

      if (search) {
        const s = `%${escapeLikePattern(search)}%`;
        const pIdx = params.push(s);
        conditions.push(
          `(l.phone_number ILIKE $${pIdx} OR l.contact_name ILIKE $${pIdx} OR l.company_name ILIKE $${pIdx} OR c.remark ILIKE $${pIdx})`
        );
      }

      const whereClause = conditions.join(" AND ");

      const countParams = [...params];
      const limitIdx = params.push(limit);
      const offsetIdx = params.push(offset);

      const rnrCte = `
        WITH rnr_numbered AS (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY COALESCE(lead_id::text, id::text)
                   ORDER BY call_timestamp ASC, id ASC
                 )::int as rnr_attempt
          FROM call_logs
          WHERE tenant_id = $1
            AND COALESCE(log_source, 'dialer_web') <> 'sheet_import'
            AND (
              disposition IN ('RNR', 'Ringing No Response', 'Ring No Response')
              OR disposition ILIKE '%Ringing%'
              OR disposition ILIKE '%No Response%'
              OR disposition ILIKE '%No Answer%'
            )
        )
      `;

      const callsRes = await client.query(
        `${rnrCte}
         SELECT c.id, c.tenant_id as "tenantId", c.lead_id as "leadId", c.rep_id as "repId",
                c.disposition, c.duration_seconds as "durationSeconds", c.remark, c.recording_url as "recordingUrl",
                COALESCE(c.log_source, 'dialer_web') as "logSource",
                COALESCE(c.is_interested, false) as "isInterested",
                rn.rnr_attempt as "rnrAttempt",
                c.call_timestamp as "callTimestamp",
                l.id as "lead_id", l.phone_number as "lead_phoneNumber", l.contact_name as "lead_contactName",
                l.company_name as "lead_companyName", l.business_vertical as "lead_businessVertical",
                l.status as "lead_status",
                u.id as "rep_id", u.full_name as "rep_fullName", u.email as "rep_email"
         FROM call_logs c
         LEFT JOIN rnr_numbered rn ON c.id = rn.id
         LEFT JOIN leads l ON c.lead_id = l.id AND l.tenant_id = c.tenant_id
         LEFT JOIN users u ON c.rep_id = u.id AND u.tenant_id = c.tenant_id
         WHERE ${whereClause}
         ORDER BY c.call_timestamp DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );

      const countRes = await client.query(
        `${rnrCte}
         SELECT COUNT(c.id)::int as total,
                COALESCE(SUM(c.duration_seconds), 0)::int as "totalDuration",
                COUNT(CASE 
                  WHEN c.disposition NOT IN ('RNR', 'Ringing No Response', 'Ring No Response', 'Invalid')
                   AND (c.duration_seconds > 0 OR c.disposition IN ('Connected', 'Interested', 'Contacted', 'Answered', 'Callback', 'Callback Requested', 'Demo Scheduled', 'Demo Done', 'Demo Completed', 'Already Using Our Service', 'Already Purchased or Using Other Company Service', 'Not Interested', 'Future Requirement'))
                  THEN 1 
                END)::int as "connectedCount",
                COUNT(CASE 
                  WHEN ${interestedCallSql("c")}
                  THEN 1
                END)::int as "interestedCount"
         FROM call_logs c
         LEFT JOIN rnr_numbered rn ON c.id = rn.id
         LEFT JOIN leads l ON c.lead_id = l.id AND l.tenant_id = c.tenant_id
         WHERE ${whereClause}`,
        countParams
      );

      const total = countRes.rows[0]?.total || 0;
      const totalDuration = countRes.rows[0]?.totalDuration || 0;
      const connectedCount = countRes.rows[0]?.connectedCount || 0;
      const interestedCount = countRes.rows[0]?.interestedCount || 0;
      const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
      const connectedRate = total > 0 ? Math.round((connectedCount / total) * 100) : 0;
      const interestedRate = connectedCount > 0 ? Math.round((interestedCount / connectedCount) * 100) : 0;

      const calls = callsRes.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        leadId: r.leadId,
        repId: r.repId,
        disposition: r.disposition,
        durationSeconds: r.durationSeconds,
        remark: r.remark,
        recordingUrl: r.recordingUrl || null,
        logSource: r.logSource || "dialer_web",
        isInterested: Boolean(r.isInterested),
        rnrAttempt: r.rnrAttempt ? Number(r.rnrAttempt) : null,
        callTimestamp: r.callTimestamp,
        lead: r.lead_id
          ? {
              id: r.lead_id,
              phoneNumber: r.lead_phoneNumber,
              contactName: r.lead_contactName,
              companyName: r.lead_companyName,
              businessVertical: r.lead_businessVertical,
              status: r.lead_status,
            }
          : null,
        rep: r.rep_id
          ? {
              id: r.rep_id,
              fullName: r.rep_fullName,
              email: r.rep_email,
            }
          : null,
      }));

      return NextResponse.json({
        calls,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        summary: {
          totalCalls: total,
          connectedCalls: connectedCount,
          connectedRate,
          interestedCalls: interestedCount,
          interestedRate,
          totalDurationSeconds: totalDuration,
          avgDurationSeconds: avgDuration,
        },
      });
    });
  } catch (error) {
    console.error("[CALLS GET]", error);
    return NextResponse.json({ error: "Failed to retrieve call logs" }, { status: 500 });
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
    const isBatch = Array.isArray(body.calls);
    const items = isBatch ? body.calls : [body];

    if (items.length > 500) {
      return NextResponse.json({ error: "Batch size exceeds 500 call logs" }, { status: 400 });
    }

    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const createdLogs = [];

        for (const item of items) {
          let targetLeadId: string | null = item.leadId ? String(item.leadId).trim() : null;
          const phoneNumber = item.phoneNumber ? String(item.phoneNumber).trim() : null;
          const durationSeconds =
            typeof item.durationSeconds === "number" ? Math.max(0, item.durationSeconds) : 0;
          const disposition = item.disposition || (durationSeconds > 0 ? "Connected" : "RNR");
          const remark = item.remark || null;
          const rawRecordingUrl = item.recordingUrl || item.recording_url || null;
          const recordingUrl = rawRecordingUrl
            ? sanitizeExternalUrl(rawRecordingUrl, { allowRelative: true })
            : null;
          const logSource = item.logSource || "apk_manual";
          const isPendingAutoCapture = logSource === "apk_connected" || logSource === "dialer_connected";
          const explicitInterestedVal: boolean | null = isPendingAutoCapture
            ? null
            : Boolean(item.isInterested) || disposition === "Interested";

          let callTimestamp = new Date();
          if (item.callTimestamp) {
            const raw = String(item.callTimestamp).trim();
            const hasTz = /Z|[+-]\d{2}(:\d{2})?$/i.test(raw);
            const parsed = new Date(hasTz ? raw : `${raw}+05:30`);
            if (!isNaN(parsed.getTime())) {
              if (parsed.getTime() > Date.now() + 5 * 60 * 1000) {
                callTimestamp = new Date();
              } else {
                callTimestamp = parsed;
              }
            }
          }

          if (targetLeadId) {
            if (!isValidUuid(targetLeadId)) {
              if (!isBatch) {
                await client.query("ROLLBACK");
                return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
              }
              continue;
            }
            const leadCheck = await client.query(
              `SELECT id, assigned_rep_id as "assignedRepId" FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
              [targetLeadId, tenantId]
            );
            if (leadCheck.rows.length === 0) {
              if (!isBatch) {
                await client.query("ROLLBACK");
                return NextResponse.json({ error: "Lead not found" }, { status: 404 });
              }
              continue;
            }
            const assignedRep = leadCheck.rows[0].assignedRepId;
            if (isSalesRep(role) && assignedRep && assignedRep !== repId) {
              if (!isBatch) {
                await client.query("ROLLBACK");
                return NextResponse.json(
                  { error: "Forbidden: Lead is assigned to another representative." },
                  { status: 403 }
                );
              }
              continue;
            }
          } else if (phoneNumber) {
            const cleanDigits = phoneNumber.replace(/\D/g, "");
            const searchSuffix = cleanDigits.slice(-10);

            if (searchSuffix.length >= 7) {
              const existingLeadRes = await client.query(
                `SELECT id, assigned_rep_id as "assignedRepId" FROM leads WHERE tenant_id = $1 AND phone_number LIKE $2 LIMIT 1`,
                [tenantId, `%${searchSuffix}`]
              );

              if (existingLeadRes.rows.length > 0) {
                const matched = existingLeadRes.rows[0];
                if (isSalesRep(role) && matched.assignedRepId && matched.assignedRepId !== repId) {
                  if (!isBatch) {
                    await client.query("ROLLBACK");
                    return NextResponse.json(
                      { error: "Forbidden: Phone belongs to a lead assigned to another representative." },
                      { status: 403 }
                    );
                  }
                  continue;
                }
                targetLeadId = matched.id;
              } else {
                const newLeadRes = await client.query(
                  `INSERT INTO leads (tenant_id, phone_number, assigned_rep_id, source, status, created_at, updated_at)
                   VALUES ($1, $2, $3, 'Mobile Dialer App', $4, NOW(), NOW())
                   RETURNING id`,
                  [tenantId, phoneNumber, repId, disposition === "Connected" ? "callback" : "new"]
                );
                targetLeadId = newLeadRes.rows[0].id;
              }
            }
          }

          if (!targetLeadId) {
            continue;
          }

        // Deduplication and Upsert:
        // Match the same call interaction:
        // 1. Within 5 minutes of callTimestamp
        // 2. Or matching duration (+/- 3 seconds) within the last 15 minutes
        // 3. Or an un-disposed SIM dialer capture waiting for match within 15 minutes
        const isAutoLoggedRemark = typeof remark === "string" && /auto-logged/i.test(remark);
        if (isAutoLoggedRemark) {
          const existingManualRes = await client.query(
            `SELECT id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                    disposition, duration_seconds as "durationSeconds", remark,
                    recording_url as "recordingUrl", log_source as "logSource", COALESCE(is_interested, false) as "isInterested", call_timestamp as "callTimestamp"
             FROM call_logs
             WHERE tenant_id = $1 AND lead_id = $2 AND rep_id = $3
               AND call_timestamp >= ($4::TIMESTAMPTZ - INTERVAL '5 minutes')
               AND call_timestamp <= ($4::TIMESTAMPTZ + INTERVAL '5 minutes')
               AND ABS(duration_seconds - $5::int) <= 3
               AND (remark IS DISTINCT FROM 'Captured from SIM dialer')
             ORDER BY call_timestamp DESC
             LIMIT 1`,
            [tenantId, targetLeadId, repId, callTimestamp, durationSeconds]
          );
          if (existingManualRes.rows.length > 0) {
            createdLogs.push(existingManualRes.rows[0]);
            continue;
          }
        }

        const isInboundSource = String(logSource).startsWith("inbound_");
        const recentLogRes = await client.query(
          `SELECT id, disposition, duration_seconds as "durationSeconds", log_source as "logSource", remark, recording_url as "recordingUrl", call_timestamp as "callTimestamp"
           FROM call_logs
           WHERE tenant_id = $1 AND lead_id = $2 AND rep_id = $3
             AND (
               (
                 call_timestamp >= ($4::TIMESTAMPTZ - INTERVAL '5 minutes')
                 AND call_timestamp <= ($4::TIMESTAMPTZ + INTERVAL '5 minutes')
                 AND (COALESCE(log_source, 'dialer_web') LIKE 'inbound_%') = $6::boolean
                 AND (
                   (duration_seconds > 0) = ($5::int > 0)
                   OR remark = 'Captured from SIM dialer'
                   OR log_source IN ('dialer_connected', 'apk_connected', 'dialer_rnr')
                 )
               )
               OR (
                 call_timestamp >= ($4::TIMESTAMPTZ - INTERVAL '15 minutes')
                 AND $5::int > 0
                 AND ABS(duration_seconds - $5::int) <= 3
                 AND (COALESCE(log_source, 'dialer_web') LIKE 'inbound_%') = $6::boolean
               )
               OR (
                 $6::boolean = false
                 AND call_timestamp >= NOW() - INTERVAL '15 minutes'
                 AND (remark = 'Captured from SIM dialer' OR log_source IN ('dialer_connected', 'apk_connected', 'dialer_rnr'))
               )
             )
           ORDER BY call_timestamp DESC
           LIMIT 1`,
          [tenantId, targetLeadId, repId, callTimestamp, durationSeconds, isInboundSource]
        );

        let finalLog;
        if (recentLogRes.rows.length > 0) {
          const existing = recentLogRes.rows[0];
          const newDuration = Math.max(existing.durationSeconds || 0, durationSeconds);
          // If the existing log already has a manual disposition/notes entered by the sales rep, DO NOT overwrite with raw SIM background values
          const isManualDisposed = existing.logSource === "apk_manual" || (existing.remark && existing.remark !== "Captured from SIM dialer");
          const finalDisposition = isManualDisposed ? existing.disposition : disposition;
          const finalRemark = isManualDisposed ? existing.remark : (remark || existing.remark);
          const finalSource = isManualDisposed ? existing.logSource : (logSource || existing.logSource);
          const finalRecording = recordingUrl || existing.recordingUrl;
          const finalTimestamp = existing.callTimestamp || callTimestamp;

          const updatedRes = await client.query(
            `UPDATE call_logs
             SET disposition = $1,
                 duration_seconds = $2,
                 remark = $3,
                 recording_url = $4,
                 log_source = $5,
                 call_timestamp = $6,
                 is_interested = COALESCE($7, is_interested)
             WHERE id = $8 AND tenant_id = $9
             RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                       disposition, duration_seconds as "durationSeconds", remark,
                       recording_url as "recordingUrl", log_source as "logSource", COALESCE(is_interested, false) as "isInterested", call_timestamp as "callTimestamp"`,
            [finalDisposition, newDuration, finalRemark, finalRecording, finalSource, finalTimestamp, isManualDisposed ? null : explicitInterestedVal, existing.id, tenantId]
          );
          finalLog = updatedRes.rows[0];

          // Synchronize lead rnr_count exactly to count of RNR call logs
          await client.query(
            `UPDATE leads
             SET rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1 AND tenant_id = $2 AND disposition = 'RNR'),
                 updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [targetLeadId, tenantId]
          );
        } else {
          const logRes = await client.query(
            `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, recording_url, log_source, is_interested, call_timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                       disposition, duration_seconds as "durationSeconds", remark,
                       recording_url as "recordingUrl", log_source as "logSource", COALESCE(is_interested, false) as "isInterested", call_timestamp as "callTimestamp"`,
            [tenantId, targetLeadId, repId, disposition, durationSeconds, remark, recordingUrl, logSource, explicitInterestedVal, callTimestamp]
          );
          finalLog = logRes.rows[0];

          // Synchronize lead rnr_count exactly to count of RNR call logs
          await client.query(
            `UPDATE leads
             SET rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1 AND tenant_id = $2 AND disposition = 'RNR'),
                 updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [targetLeadId, tenantId]
          );
        }

        // Synchronize lead status and demo scheduled/completed tasks
        if (disposition === "Demo Done" || disposition === "Demo Completed") {
          const taskUpdate = await client.query(
            "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'pending' RETURNING id",
            [targetLeadId, tenantId]
          );
          if ((taskUpdate.rowCount || 0) === 0) {
            await client.query(
              `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at)
               VALUES ($1, $2, $3, 'product_demo', $4, 'Product demo completed', 'completed', 'dialer', $4, $4)`,
              [tenantId, targetLeadId, repId, callTimestamp]
            );
          }

          await client.query(
            "UPDATE leads SET status = 'demo_done', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
            [targetLeadId, tenantId]
          );

          const dealCheck = await client.query(
            "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1",
            [targetLeadId, tenantId]
          );
          if (dealCheck.rows.length > 0) {
            await client.query(
              "UPDATE deals SET stage = 'demo_done', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
              [dealCheck.rows[0].id, tenantId]
            );
          } else {
            await client.query(
              `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
               VALUES ($1, $2, $3, 'WhatsApp API', 0, 0, 'demo_done', 'Product demo completed', NOW(), NOW())`,
              [tenantId, targetLeadId, repId]
            );
          }
        } else if (disposition === "Demo Scheduled") {
          await client.query(
            "UPDATE leads SET status = 'demo_scheduled', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
            [targetLeadId, tenantId]
          );
          const dealCheck = await client.query(
            "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1",
            [targetLeadId, tenantId]
          );
          if (dealCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
               VALUES ($1, $2, $3, 'WhatsApp API', 0, 0, 'demo_scheduled', $4, NOW(), NOW())`,
              [tenantId, targetLeadId, repId, remark || "Product demo scheduled"]
            );
          }
        }

        // Clear overdue pending callback tasks when a real/disposed call is synced via APK/Dialer
        if (!isPendingAutoCapture && targetLeadId) {
          const syncTag = remark
            ? `[Attempted via Dialer/APK: ${disposition} — ${remark}]`
            : `[Attempted via Dialer/APK: ${disposition}]`;
          await client.query(
            `UPDATE scheduled_tasks
             SET status = 'completed',
                 notes = CASE
                   WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' ' || $4
                   ELSE $4
                 END,
                 updated_at = NOW()
             WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'callback' AND status = 'pending'
               AND scheduled_time IS NOT NULL AND scheduled_time <= $3`,
            [targetLeadId, tenantId, callTimestamp, syncTag]
          ).catch(() => {});
        }

        createdLogs.push(finalLog);
      }

      await client.query("COMMIT");

      if (isBatch) {
        return NextResponse.json(
          {
            syncedCount: createdLogs.length,
            callLogs: createdLogs,
          },
          { status: 201 }
        );
      }

      if (createdLogs.length === 0) {
        return NextResponse.json(
          { error: "leadId or valid phoneNumber is required" },
          { status: 400 }
        );
      }

      return NextResponse.json({ callLog: createdLogs[0] }, { status: 201 });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[CALLS POST]", error);
    return NextResponse.json({ error: "Failed to record call log" }, { status: 500 });
  }
}
