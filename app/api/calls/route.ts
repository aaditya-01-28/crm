import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
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
        conditions.push(`c.disposition = $${params.push(disposition)}`);
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
                c.disposition, c.duration_seconds as "durationSeconds", c.remark,
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
                COUNT(CASE WHEN c.disposition = 'Connected' THEN 1 END)::int as "connectedCount"
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
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body.calls) ? body.calls : [body];

    return await withClient(async (client) => {
      const createdLogs = [];

      for (const item of items) {
        let targetLeadId = item.leadId;
        const phoneNumber = item.phoneNumber ? String(item.phoneNumber).trim() : null;
        const durationSeconds =
          typeof item.durationSeconds === "number" ? Math.max(0, item.durationSeconds) : 0;
        const disposition = item.disposition || (durationSeconds > 0 ? "Connected" : "RNR");
        const remark = item.remark || null;
        const callTimestamp = item.callTimestamp ? new Date(item.callTimestamp) : new Date();

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

        const logRes = await client.query(
          `INSERT INTO call_logs (tenant_id, lead_id, rep_id, disposition, duration_seconds, remark, call_timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                     disposition, duration_seconds as "durationSeconds", remark, call_timestamp as "callTimestamp"`,
          [tenantId, targetLeadId, repId, disposition, durationSeconds, remark, callTimestamp]
        );

        if (disposition === "RNR") {
          await client.query(
            "UPDATE leads SET rnr_count = rnr_count + 1, updated_at = NOW() WHERE id = $1",
            [targetLeadId]
          );
        } else {
          await client.query("UPDATE leads SET updated_at = NOW() WHERE id = $1", [targetLeadId]);
        }

        createdLogs.push(logRes.rows[0]);
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
