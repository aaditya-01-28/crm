import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";
  const { searchParams } = new URL(request.url);

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leadId = searchParams.get("leadId");
  const filterRepId = searchParams.get("repId");
  const disposition = searchParams.get("disposition");
  const search = searchParams.get("search")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const offset = (page - 1) * limit;

  try {
    return await withClient(async (client) => {
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;").catch(() => {});
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS log_source TEXT DEFAULT 'dialer_web';").catch(() => {});

      // Correct existing leads where remark indicates competitor / other company service but status was already_using
      await client.query(`
        UPDATE leads
        SET status = 'already_purchased', updated_at = NOW()
        WHERE status = 'already_using'
          AND id IN (
            SELECT lead_id FROM call_logs
            WHERE remark ILIKE '%other compny%' OR remark ILIKE '%other company%' OR remark ILIKE '%competitor%'
          );
      `).catch(() => {});

      const conditions: string[] = ["c.tenant_id = $1"];
      const params: any[] = [tenantId];

      if (role === "sales_rep") {
        conditions.push(`c.rep_id = $${params.push(repId)}`);
      } else if (filterRepId && filterRepId !== "all") {
        conditions.push(`c.rep_id = $${params.push(filterRepId)}`);
      }

      if (leadId) {
        conditions.push(`c.lead_id = $${params.push(leadId)}`);
      }

      if (disposition && disposition !== "all") {
        if (disposition === "Connected" || disposition === "connected") {
          conditions.push(
            `(c.duration_seconds > 0 OR c.disposition = 'Connected' OR c.disposition ILIKE '%Connected%' OR c.disposition = 'Contacted' OR c.disposition = 'Answered')`
          );
        } else if (
          disposition === "RNR" ||
          disposition === "Ringing No Response" ||
          disposition === "Ring No Response"
        ) {
          conditions.push(
            `(c.duration_seconds = 0 AND (c.disposition = 'RNR' OR c.disposition ILIKE '%Ringing%' OR c.disposition ILIKE '%No Response%' OR c.disposition ILIKE '%No Answer%'))`
          );
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
        conditions.push(`c.call_timestamp >= $${params.push(new Date(dateFrom))}`);
      }
      if (dateTo) {
        const end = new Date(dateTo);
        if (dateTo.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        conditions.push(`c.call_timestamp <= $${params.push(end)}`);
      }

      if (search) {
        const s = `%${search}%`;
        const pIdx = params.push(s);
        conditions.push(
          `(l.phone_number ILIKE $${pIdx} OR l.contact_name ILIKE $${pIdx} OR l.company_name ILIKE $${pIdx} OR c.remark ILIKE $${pIdx})`
        );
      }

      const whereClause = conditions.join(" AND ");

      const countParams = [...params];
      const limitIdx = params.push(limit);
      const offsetIdx = params.push(offset);

      const callsRes = await client.query(
        `SELECT c.id, c.tenant_id as "tenantId", c.lead_id as "leadId", c.rep_id as "repId",
                c.disposition, c.duration_seconds as "durationSeconds", c.remark, c.recording_url as "recordingUrl",
                COALESCE(c.log_source, 'dialer_web') as "logSource",
                c.call_timestamp as "callTimestamp",
                l.id as "lead_id", l.phone_number as "lead_phoneNumber", l.contact_name as "lead_contactName",
                l.company_name as "lead_companyName", l.business_vertical as "lead_businessVertical",
                l.status as "lead_status",
                u.id as "rep_id", u.full_name as "rep_fullName", u.email as "rep_email"
         FROM call_logs c
         LEFT JOIN leads l ON c.lead_id = l.id
         LEFT JOIN users u ON c.rep_id = u.id
         WHERE ${whereClause}
         ORDER BY c.call_timestamp DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );

      const countRes = await client.query(
        `SELECT COUNT(c.id)::int as total,
                COALESCE(SUM(c.duration_seconds), 0)::int as "totalDuration",
                COUNT(CASE WHEN c.duration_seconds > 0 OR c.disposition ILIKE '%Connected%' OR c.disposition = 'Contacted' THEN 1 END)::int as "connectedCount"
         FROM call_logs c
         LEFT JOIN leads l ON c.lead_id = l.id
         WHERE ${whereClause}`,
        countParams
      );

      const total = countRes.rows[0]?.total || 0;
      const totalDuration = countRes.rows[0]?.totalDuration || 0;
      const connectedCount = countRes.rows[0]?.connectedCount || 0;
      const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
      const connectedRate = total > 0 ? Math.round((connectedCount / total) * 100) : 0;

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
  const session = await getSession(request);
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body.calls) ? body.calls : [body];

    return await withClient(async (client) => {
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;").catch(() => {});
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS log_source TEXT DEFAULT 'dialer_web';").catch(() => {});
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS log_source TEXT DEFAULT 'dialer_web';").catch(() => {});
      const createdLogs = [];

      for (const item of items) {
        let targetLeadId = item.leadId;
        const phoneNumber = item.phoneNumber ? String(item.phoneNumber).trim() : null;
        const durationSeconds =
          typeof item.durationSeconds === "number" ? Math.max(0, item.durationSeconds) : 0;
        const disposition = item.disposition || (durationSeconds > 0 ? "Connected" : "RNR");
        const remark = item.remark || null;
        const recordingUrl = item.recordingUrl || item.recording_url || null;
        const logSource = item.logSource || "apk_manual";

        // Timezone-safe timestamp parsing:
        // Indian clients often serialize local ISO strings without trailing Z (e.g. "2026-11-23T11:34:00.000").
        // In UTC server environments, new Date(str_without_tz) is parsed as UTC, causing an incorrect +5:30 shift in IST browsers.
        let callTimestamp = new Date();
        if (item.callTimestamp) {
          const raw = String(item.callTimestamp).trim();
          const hasTz = /Z|[+-]\d{2}(:\d{2})?$/i.test(raw);
          const parsed = new Date(hasTz ? raw : `${raw}+05:30`);
          if (!isNaN(parsed.getTime())) {
            // Guard against timestamps in the future (> 5 mins)
            if (parsed.getTime() > Date.now() + 5 * 60 * 1000) {
              callTimestamp = new Date();
            } else {
              callTimestamp = parsed;
            }
          }
        }

        if (!targetLeadId && phoneNumber) {
          const cleanDigits = phoneNumber.replace(/\D/g, "");
          const searchSuffix = cleanDigits.slice(-10);

          const existingLeadRes = await client.query(
            "SELECT id FROM leads WHERE tenant_id = $1 AND phone_number LIKE $2 LIMIT 1",
            [tenantId, `%${searchSuffix}`]
          );

          if (existingLeadRes.rows.length > 0) {
            targetLeadId = existingLeadRes.rows[0].id;
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

        if (!targetLeadId) {
          continue;
        }

        // Deduplication and Upsert:
        // Only treat as the same call if it has the exact same timestamp (within 15 seconds) from a network retry/duplicate.
        // Multiple calls placed to the same lead minutes or hours apart are distinct interactions and must NEVER be overwritten!
        const recentLogRes = await client.query(
          `SELECT id, disposition, duration_seconds as "durationSeconds", log_source as "logSource", remark, recording_url as "recordingUrl", call_timestamp as "callTimestamp"
           FROM call_logs
           WHERE tenant_id = $1 AND lead_id = $2 AND rep_id = $3
             AND call_timestamp >= ($4::TIMESTAMPTZ - INTERVAL '15 seconds')
             AND call_timestamp <= ($4::TIMESTAMPTZ + INTERVAL '15 seconds')
           ORDER BY call_timestamp DESC
           LIMIT 1`,
          [tenantId, targetLeadId, repId, callTimestamp]
        );

        let finalLog;
        if (recentLogRes.rows.length > 0) {
          const existing = recentLogRes.rows[0];
          const newDuration = Math.max(existing.durationSeconds || 0, durationSeconds);
          const newRemark = remark || existing.remark;
          const newRecording = recordingUrl || existing.recordingUrl;
          const finalSource = logSource === "apk_manual" ? "apk_manual" : existing.logSource || logSource;
          const finalTimestamp = existing.callTimestamp || callTimestamp;

          const updatedRes = await client.query(
            `UPDATE call_logs
             SET disposition = $1,
                 duration_seconds = $2,
                 remark = $3,
                 recording_url = $4,
                 log_source = $5,
                 call_timestamp = $6
             WHERE id = $7
             RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                       disposition, duration_seconds as "durationSeconds", remark,
                       recording_url as "recordingUrl", log_source as "logSource", call_timestamp as "callTimestamp"`,
            [disposition, newDuration, newRemark, newRecording, finalSource, finalTimestamp, existing.id]
          );
          finalLog = updatedRes.rows[0];

          // Synchronize lead rnr_count exactly to count of RNR call logs
          await client.query(
            `UPDATE leads
             SET rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1 AND disposition = 'RNR'),
                 updated_at = NOW()
             WHERE id = $1`,
            [targetLeadId]
          );
        } else {
          const logRes = await client.query(
            `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, recording_url, log_source, call_timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                       disposition, duration_seconds as "durationSeconds", remark,
                       recording_url as "recordingUrl", log_source as "logSource", call_timestamp as "callTimestamp"`,
            [tenantId, targetLeadId, repId, disposition, durationSeconds, remark, recordingUrl, logSource, callTimestamp]
          );
          finalLog = logRes.rows[0];

          // Synchronize lead rnr_count exactly to count of RNR call logs
          await client.query(
            `UPDATE leads
             SET rnr_count = (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1 AND disposition = 'RNR'),
                 updated_at = NOW()
             WHERE id = $1`,
            [targetLeadId]
          );
        }

        // Synchronize lead status and demo scheduled/completed tasks
        if (disposition === "Demo Done" || disposition === "Demo Completed") {
          // 1. Mark pending product_demo tasks completed so scheduled count decrements
          const taskUpdate = await client.query(
            "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND task_type = 'product_demo' AND status = 'pending' RETURNING id",
            [targetLeadId]
          );
          if ((taskUpdate.rowCount || 0) === 0) {
            await client.query(
              `INSERT INTO scheduled_tasks (tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at)
               VALUES ($1, $2, $3, 'product_demo', $4, 'Product demo completed', 'completed', 'dialer', $4, $4)`,
              [tenantId, targetLeadId, repId, callTimestamp]
            ).catch(() => {});
          }

          // 2. Advance lead status to demo_done
          await client.query(
            "UPDATE leads SET status = 'demo_done', updated_at = NOW() WHERE id = $1",
            [targetLeadId]
          );

          // 3. Sync deal stage to demo_done
          const dealCheck = await client.query(
            "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1",
            [targetLeadId, tenantId]
          );
          if (dealCheck.rows.length > 0) {
            await client.query(
              "UPDATE deals SET stage = 'demo_done', updated_at = NOW() WHERE id = $1",
              [dealCheck.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
               VALUES ($1, $2, $3, 'WhatsApp API', 10000, 0, 'demo_done', 'Product demo completed', NOW(), NOW())`,
              [tenantId, targetLeadId, repId]
            ).catch(() => {});
          }
        } else if (disposition === "Demo Scheduled") {
          await client.query(
            "UPDATE leads SET status = 'demo_scheduled', updated_at = NOW() WHERE id = $1",
            [targetLeadId]
          );
        }

        createdLogs.push(finalLog);
      }

      if (Array.isArray(body.calls)) {
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
    });
  } catch (error) {
    console.error("[CALLS POST]", error);
    return NextResponse.json({ error: "Failed to record call log" }, { status: 500 });
  }
}
