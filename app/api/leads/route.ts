import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can, isSalesRep, isAdmin } from "@/lib/rbac";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";
  const { searchParams } = new URL(request.url);

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = searchParams.get("status");
  const vertical = searchParams.get("vertical");
  const search = searchParams.get("search")?.trim();
  const filterRepId = searchParams.get("repId");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
  const queue = searchParams.get("queue") === "true";
  const allIds = searchParams.get("allIds") === "true";

  try {
    return await withClient(async (client) => {
      // 1. Queue mode for Dialer Console
      if (queue) {
        const queueRes = await client.query(
          `SELECT l.id, l.tenant_id as "tenantId", l.assigned_rep_id as "assignedRepId",
                  l.phone_number as "phoneNumber", l.contact_name as "contactName",
                  l.company_name as "companyName", l.website_url as "websiteUrl",
                  l.business_vertical as "businessVertical", l.service_type as "serviceType",
                  l.source, l.status, l.rnr_count as "rnrCount", l.custom_metadata as "customMetadata",
                  l.created_at as "createdAt", l.updated_at as "updatedAt",
                  u.full_name as "assignedRepFullName",
                  (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = l.id AND rep_id = $2) as "callLogsCount"
           FROM leads l
           LEFT JOIN users u ON l.assigned_rep_id = u.id
           WHERE l.tenant_id = $1 AND l.assigned_rep_id = $2
             AND (l.status = 'new' OR (l.status = 'rnr' AND l.rnr_count < 3))
           ORDER BY l.rnr_count ASC, l.created_at ASC
           LIMIT 1`,
          [tenantId, repId]
        );

        if (queueRes.rows.length === 0) {
          return NextResponse.json({ lead: null });
        }

        const q = queueRes.rows[0];
        const lead = {
          id: q.id,
          tenantId: q.tenantId,
          assignedRepId: q.assignedRepId,
          phoneNumber: q.phoneNumber,
          contactName: q.contactName,
          companyName: q.companyName,
          websiteUrl: q.websiteUrl,
          businessVertical: q.businessVertical,
          serviceType: q.serviceType,
          source: q.source,
          status: q.status,
          rnrCount: q.rnrCount,
          customMetadata: q.customMetadata,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          assignedRep: q.assignedRepFullName ? { fullName: q.assignedRepFullName } : null,
          _count: { callLogs: q.callLogsCount },
        };

        return NextResponse.json({ lead });
      }

      // 2. Standard Leads Directory Filter
      const baseConditions: string[] = ["l.tenant_id = $1"];
      const baseParams: any[] = [tenantId];

      if (isSalesRep(role)) {
        baseConditions.push(`l.assigned_rep_id = $${baseParams.push(repId)}`);
      } else if (filterRepId) {
        if (filterRepId === "unassigned") {
          baseConditions.push("l.assigned_rep_id IS NULL");
        } else {
          baseConditions.push(`l.assigned_rep_id = $${baseParams.push(filterRepId)}`);
        }
      }

      const conditions: string[] = [...baseConditions];
      const params: any[] = [...baseParams];

      if (status && status !== "all") {
        if (status === "already_using" || status === "already_purchased") {
          conditions.push(`(l.status = 'already_using' OR l.status = 'already_purchased')`);
        } else {
          conditions.push(`l.status = $${params.push(status)}`);
        }
      }

      if (vertical && vertical !== "all") {
        conditions.push(`l.business_vertical = $${params.push(vertical)}`);
      }

      if (search) {
        const searchPattern = `%${search}%`;
        const pIdx = params.push(searchPattern);
        conditions.push(
          `(l.company_name ILIKE $${pIdx} OR l.contact_name ILIKE $${pIdx} OR l.phone_number ILIKE $${pIdx} OR l.business_vertical ILIKE $${pIdx} OR l.service_type ILIKE $${pIdx})`
        );
      }

      const whereClause = conditions.join(" AND ");

      if (allIds) {
        const allIdsRes = await client.query(
          `SELECT l.id FROM leads l WHERE ${whereClause} ORDER BY l.updated_at DESC`,
          params
        );
        return NextResponse.json(
          { ids: allIdsRes.rows.map((r: any) => r.id), total: allIdsRes.rows.length },
          {
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
          }
        );
      }

      const limitIdx = params.push(limit);
      const offsetIdx = params.push((page - 1) * limit);

      const leadsRes = await client.query(
        `SELECT l.id, l.tenant_id as "tenantId", l.assigned_rep_id as "assignedRepId",
                l.first_assigned_rep_id as "firstAssignedRepId", l.first_assigned_at as "firstAssignedAt",
                l.phone_number as "phoneNumber", l.contact_name as "contactName",
                l.company_name as "companyName", l.website_url as "websiteUrl",
                l.business_vertical as "businessVertical", l.service_type as "serviceType",
                l.source, l.status, l.rnr_count as "rnrCount", l.custom_metadata as "customMetadata",
                l.created_at as "createdAt", l.updated_at as "updatedAt",
                ar.id as "arId", ar.full_name as "arFullName",
                far.id as "farId", far.full_name as "farFullName",
                (SELECT json_build_object(
                   'disposition', cl.disposition,
                   'remark', cl.remark,
                   'durationSeconds', cl.duration_seconds,
                   'callTimestamp', cl.call_timestamp,
                   'rep', json_build_object('fullName', ru.full_name)
                 )
                 FROM call_logs cl
                 LEFT JOIN users ru ON cl.rep_id = ru.id
                 WHERE cl.lead_id = l.id ${isSalesRep(role) ? `AND cl.rep_id = '${repId}'` : ""}
                 ORDER BY cl.call_timestamp DESC LIMIT 1
                ) as "latestCallLog",
                (SELECT COUNT(*)::int FROM call_logs cl WHERE cl.lead_id = l.id ${isSalesRep(role) ? `AND cl.rep_id = '${repId}'` : ""}) as "callLogsCount",
                (SELECT COUNT(*)::int FROM scheduled_tasks st WHERE st.lead_id = l.id ${isSalesRep(role) ? `AND st.rep_id = '${repId}'` : ""}) as "tasksCount",
                (SELECT COUNT(*)::int FROM deals d WHERE d.lead_id = l.id ${isSalesRep(role) ? `AND d.rep_id = '${repId}'` : ""}) as "dealsCount"
         FROM leads l
         LEFT JOIN users ar ON l.assigned_rep_id = ar.id
         LEFT JOIN users far ON l.first_assigned_rep_id = far.id
         WHERE ${whereClause}
         ORDER BY l.updated_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );

      const countParams = params.slice(0, params.length - 2);
      const countRes = await client.query(
        `SELECT COUNT(l.id)::int as total FROM leads l WHERE ${whereClause}`,
        countParams
      );
      const total = countRes.rows[0]?.total || 0;

      const baseWhereClause = baseConditions.join(" AND ");
      const statusCountsRes = await client.query(
        `SELECT status, COUNT(id)::int as count FROM leads l WHERE ${baseWhereClause} GROUP BY status`,
        baseParams
      );

      let unassignedTotal = 0;
      if (role !== "sales_rep") {
        const unassignedRes = await client.query(
          "SELECT COUNT(id)::int as count FROM leads WHERE tenant_id = $1 AND assigned_rep_id IS NULL",
          [tenantId]
        );
        unassignedTotal = unassignedRes.rows[0]?.count || 0;
      }

      const stats: Record<string, number> = {
        all: 0,
        new: 0,
        rnr: 0,
        callback: 0,
        demo_scheduled: 0,
        deal_created: 0,
        won: 0,
        lost: 0,
        not_interested: 0,
        invalid: 0,
        already_using: 0,
        future_requirement: 0,
        unassigned: unassignedTotal,
      };

      statusCountsRes.rows.forEach((s: { status: string; count: number }) => {
        if (s.status === "already_purchased") {
          stats.already_using = (stats.already_using || 0) + s.count;
        } else {
          stats[s.status] = s.count;
        }
        stats.all += s.count;
      });

      const mappedLeads = leadsRes.rows.map((l) => ({
        id: l.id,
        tenantId: l.tenantId,
        assignedRepId: l.assignedRepId,
        firstAssignedRepId: isSalesRep(role) ? null : l.firstAssignedRepId,
        firstAssignedAt: isSalesRep(role) ? null : l.firstAssignedAt,
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
        assignedRep: l.arId ? { id: l.arId, fullName: l.arFullName } : null,
        firstAssignedRep:
          !isSalesRep(role) && l.farId ? { id: l.farId, fullName: l.farFullName } : null,
        callLogs: l.latestCallLog ? [l.latestCallLog] : [],
        _count: {
          callLogs: l.callLogsCount,
          tasks: l.tasksCount,
          deals: l.dealsCount,
        },
        preferredLanguage:
          ((l.customMetadata as Record<string, unknown>)?.preferredLanguage as string) || null,
      }));

      return NextResponse.json(
        {
          leads: mappedLeads,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          stats,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        }
      );
    });
  } catch (error) {
    console.error("[LEADS_GET_ERROR]", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  if (!tenantId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(role, "leads:create")) {
    return NextResponse.json(
      { error: "Forbidden: Only managers and admins can create leads" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      phoneNumber,
      contactName,
      companyName,
      websiteUrl,
      businessVertical,
      serviceType,
      source,
      assignedRepId,
      preferredLanguage,
    } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    const initialRep =
      can(role, "leads:assign") && assignedRepId
        ? assignedRepId
        : repId;

    const metadata = {
      ...(preferredLanguage ? { preferredLanguage } : {}),
      ...(body.address ? { address: body.address } : {}),
    };

    return await withClient(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO leads (
           tenant_id, assigned_rep_id, first_assigned_rep_id, first_assigned_at,
           phone_number, contact_name, company_name, website_url,
           business_vertical, service_type, source, status, custom_metadata,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new', $12, NOW(), NOW())
         RETURNING id, tenant_id as "tenantId", assigned_rep_id as "assignedRepId",
                   first_assigned_rep_id as "firstAssignedRepId", first_assigned_at as "firstAssignedAt",
                   phone_number as "phoneNumber", contact_name as "contactName",
                   company_name as "companyName", website_url as "websiteUrl",
                   business_vertical as "businessVertical", service_type as "serviceType",
                   source, status, rnr_count as "rnrCount", custom_metadata as "customMetadata",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [
          tenantId,
          initialRep || null,
          initialRep || null,
          initialRep ? new Date() : null,
          phoneNumber,
          contactName || null,
          companyName || null,
          websiteUrl || null,
          businessVertical || null,
          serviceType || null,
          source || "Manual Entry",
          JSON.stringify(metadata),
        ]
      );

      const lead = insertRes.rows[0];

      return NextResponse.json(
        {
          lead: {
            ...lead,
            preferredLanguage: preferredLanguage || null,
          },
        },
        { status: 201 }
      );
    });
  } catch (error) {
    console.error("[LEADS POST]", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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
    const body = await request.json();
    const { leadIds } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: "No lead IDs provided for deletion" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      await client.query("BEGIN");
      await client.query("DELETE FROM call_logs WHERE lead_id = ANY($1::uuid[])", [leadIds]);
      await client.query("DELETE FROM scheduled_tasks WHERE lead_id = ANY($1::uuid[])", [leadIds]);
      await client.query("DELETE FROM payments WHERE lead_id = ANY($1::uuid[])", [leadIds]);
      await client.query("DELETE FROM deals WHERE lead_id = ANY($1::uuid[])", [leadIds]);
      const res = await client.query(
        "DELETE FROM leads WHERE id = ANY($1::uuid[]) AND tenant_id = $2 RETURNING id",
        [leadIds, tenantId]
      );
      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        count: res.rowCount || 0,
        message: `Permanently deleted ${res.rowCount || 0} leads.`,
      });
    });
  } catch (error) {
    console.error("[LEADS_BULK_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete leads" },
      { status: 500 }
    );
  }
}
