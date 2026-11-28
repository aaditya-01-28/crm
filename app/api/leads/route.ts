import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can, isSalesRep, isAdmin } from "@/lib/rbac";
import { requireActiveSession } from "@/lib/auth";
import {
  escapeLikePattern,
  filterValidUuids,
  isValidUuid,
  sanitizeExternalUrl,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status");
  const vertical = searchParams.get("vertical");
  const search = searchParams.get("search")?.trim();
  const filterRepId = searchParams.get("repId");
  const sortBy = searchParams.get("sortBy") || "updated_desc";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(10000, Math.max(1, parseInt(searchParams.get("limit") || "25")));
  const queue = searchParams.get("queue") === "true";
  const allIds = searchParams.get("allIds") === "true";

  if (filterRepId && filterRepId !== "all" && filterRepId !== "unassigned" && !isValidUuid(filterRepId)) {
    return NextResponse.json({ error: "Invalid repId" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      // 1. Queue mode for Dialer Console
      if (queue) {
        const queueRes = await client.query(
          `SELECT l.id, l.tenant_id as "tenantId", l.assigned_rep_id as "assignedRepId",
                  COALESCE(l.assigned_at, l.first_assigned_at, (CASE WHEN l.assigned_rep_id IS NOT NULL THEN l.created_at ELSE NULL END)) as "assignedAt",
                  l.phone_number as "phoneNumber", l.contact_name as "contactName",
                  l.company_name as "companyName", l.website_url as "websiteUrl",
                  l.business_vertical as "businessVertical", l.service_type as "serviceType",
                  l.source, l.status,
                  COALESCE((SELECT COUNT(*)::int FROM call_logs WHERE lead_id = l.id AND tenant_id = l.tenant_id AND disposition = 'RNR'), l.rnr_count, 0) as "rnrCount",
                  l.custom_metadata as "customMetadata",
                  l.created_at as "createdAt", l.updated_at as "updatedAt",
                  u.full_name as "assignedRepFullName",
                  (SELECT COUNT(*)::int FROM call_logs WHERE lead_id = l.id AND tenant_id = l.tenant_id AND rep_id = $2) as "callLogsCount"
           FROM leads l
           LEFT JOIN users u ON l.assigned_rep_id = u.id AND u.tenant_id = l.tenant_id
           WHERE l.tenant_id = $1 AND l.assigned_rep_id = $2
             AND (l.status = 'new' OR (l.status = 'rnr' AND l.rnr_count < 3))
           ORDER BY
             CASE WHEN l.status = 'new' THEN 0 ELSE 1 END ASC,
             l.created_at ASC
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
          assignedAt: q.assignedAt,
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
      } else if (filterRepId && filterRepId !== "all") {
        if (filterRepId === "unassigned") {
          baseConditions.push("l.assigned_rep_id IS NULL");
        } else {
          baseConditions.push(`l.assigned_rep_id = $${baseParams.push(filterRepId)}`);
        }
      }

      const conditions: string[] = [...baseConditions];
      const params: any[] = [...baseParams];

      const RNR_COUNT_EXPR = `COALESCE((SELECT COUNT(*)::int FROM call_logs WHERE lead_id = l.id AND disposition IN ('RNR', 'Ringing No Response', 'Ring No Response')), l.rnr_count, 0)`;
      const DEMO_DONE_LEAD_SQL = `(
        l.status = 'demo_done'
        OR EXISTS (SELECT 1 FROM scheduled_tasks st WHERE st.lead_id = l.id AND st.task_type = 'product_demo' AND st.status = 'completed')
        OR EXISTS (SELECT 1 FROM call_logs cl WHERE cl.lead_id = l.id AND cl.disposition IN ('Demo Done', 'Demo Completed'))
        OR EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = l.id AND d.stage = 'demo_done')
      )`;

      if (status && status !== "all") {
        if (status === "interested") {
          conditions.push(`(l.status = 'interested' OR l.is_interested = true)`);
        } else if (status === "demo_done") {
          conditions.push(DEMO_DONE_LEAD_SQL);
        } else if (status === "new") {
          conditions.push(`(l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} = 0)`);
        } else if (status === "rnr") {
          conditions.push(`(l.status = 'rnr' OR (l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} > 0))`);
        } else if (status === "rnr_1") {
          conditions.push(`((l.status = 'rnr' OR (l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} > 0)) AND ${RNR_COUNT_EXPR} = 1)`);
        } else if (status === "rnr_2") {
          conditions.push(`((l.status = 'rnr' OR (l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} > 0)) AND ${RNR_COUNT_EXPR} = 2)`);
        } else if (status === "rnr_3") {
          conditions.push(`((l.status = 'rnr' OR (l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} > 0)) AND ${RNR_COUNT_EXPR} = 3)`);
        } else if (status === "rnr_4") {
          conditions.push(`((l.status = 'rnr' OR (l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} > 0)) AND ${RNR_COUNT_EXPR} >= 4)`);
        } else {
          conditions.push(`l.status = $${params.push(status)}`);
        }
      }

      if (vertical && vertical !== "all" && vertical !== "All Verticals") {
        conditions.push(`l.business_vertical = $${params.push(vertical)}`);
      }

      if (search) {
        const searchPattern = `%${escapeLikePattern(search)}%`;
        const pIdx = params.push(searchPattern);
        conditions.push(
          `(l.company_name ILIKE $${pIdx} OR l.contact_name ILIKE $${pIdx} OR l.phone_number ILIKE $${pIdx} OR COALESCE(l.custom_metadata->>'secondaryPhone', '') ILIKE $${pIdx} OR l.business_vertical ILIKE $${pIdx} OR l.service_type ILIKE $${pIdx})`
        );
      }

      const whereClause = conditions.join(" AND ");

      const orderByClause =
        sortBy === "newest"
          ? `COALESCE(l.assigned_at, l.first_assigned_at, l.created_at) DESC, l.created_at DESC, l.id DESC`
          : sortBy === "oldest"
          ? `COALESCE(l.assigned_at, l.first_assigned_at, l.created_at) ASC, l.created_at ASC, l.id ASC`
          : sortBy === "updated_asc"
          ? `l.updated_at ASC, l.created_at ASC, l.id ASC`
          : `l.updated_at DESC, l.created_at ASC, l.id ASC`;

      if (allIds) {
        const allIdsRes = await client.query(
          `SELECT l.id FROM leads l WHERE ${whereClause} ORDER BY ${orderByClause}`,
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
                COALESCE(l.assigned_at, l.first_assigned_at, (CASE WHEN l.assigned_rep_id IS NOT NULL THEN l.created_at ELSE NULL END)) as "assignedAt",
                l.first_assigned_rep_id as "firstAssignedRepId", l.first_assigned_at as "firstAssignedAt",
                l.phone_number as "phoneNumber", l.contact_name as "contactName",
                l.company_name as "companyName", l.website_url as "websiteUrl",
                l.business_vertical as "businessVertical", l.service_type as "serviceType",
                l.source, l.status,
                ${RNR_COUNT_EXPR} as "rnrCount",
                ${DEMO_DONE_LEAD_SQL} as "isDemoDone",
                l.custom_metadata as "customMetadata",
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
                 LEFT JOIN users ru ON cl.rep_id = ru.id AND ru.tenant_id = l.tenant_id
                 WHERE cl.lead_id = l.id AND cl.tenant_id = l.tenant_id ${isSalesRep(role) ? "AND cl.rep_id = $2" : ""}
                 ORDER BY cl.call_timestamp DESC LIMIT 1
                ) as "latestCallLog",
                (SELECT COUNT(*)::int FROM call_logs cl WHERE cl.lead_id = l.id AND cl.tenant_id = l.tenant_id ${isSalesRep(role) ? "AND cl.rep_id = $2" : ""}) as "callLogsCount",
                (SELECT COUNT(*)::int FROM scheduled_tasks st WHERE st.lead_id = l.id AND st.tenant_id = l.tenant_id ${isSalesRep(role) ? "AND st.rep_id = $2" : ""}) as "tasksCount",
                (SELECT COUNT(*)::int FROM deals d WHERE d.lead_id = l.id AND d.tenant_id = l.tenant_id ${isSalesRep(role) ? "AND d.rep_id = $2" : ""}) as "dealsCount"
         FROM leads l
         LEFT JOIN users ar ON l.assigned_rep_id = ar.id AND ar.tenant_id = l.tenant_id
         LEFT JOIN users far ON l.first_assigned_rep_id = far.id AND far.tenant_id = l.tenant_id
         WHERE ${whereClause}
         ORDER BY ${orderByClause}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );

      const countParams = params.slice(0, params.length - 2);
      const countRes = await client.query(
        `SELECT COUNT(l.id)::int as total FROM leads l WHERE ${whereClause}`,
        countParams
      );
      const total = countRes.rows[0]?.total || 0;

      // Compute status tab counts across the active filter.
      // For sales reps, counts are strictly scoped to their assigned leads.
      // For managers/admins, counts reflect the full CRM pipeline (or selected rep).
      // When viewing "unassigned" pool, we DO NOT filter statusBaseConditions by assigned_rep_id IS NULL,
      // because Unassigned Pool has its own dedicated counter (stats.unassigned), while the status tabs
      // (All Leads, New, Callbacks, RNR, etc.) represent the overall CRM pipeline counts which must remain visible.
      const statusBaseConditions: string[] = ["l.tenant_id = $1"];
      const statusBaseParams: any[] = [tenantId];

      if (isSalesRep(role)) {
        statusBaseConditions.push(`l.assigned_rep_id = $${statusBaseParams.push(repId)}`);
      } else if (filterRepId && filterRepId !== "all" && filterRepId !== "unassigned") {
        statusBaseConditions.push(`l.assigned_rep_id = $${statusBaseParams.push(filterRepId)}`);
      }

      if (vertical && vertical !== "all" && vertical !== "All Verticals") {
        statusBaseConditions.push(`l.business_vertical = $${statusBaseParams.push(vertical)}`);
      }

      const statusWhereClause = statusBaseConditions.join(" AND ");
      const statusCountsRes = await client.query(
        `SELECT status, COUNT(id)::int as count FROM leads l WHERE ${statusWhereClause} GROUP BY status`,
        statusBaseParams
      );
      const interestedLeadsRes = await client.query(
        `SELECT COUNT(id)::int as count FROM leads l WHERE ${statusWhereClause} AND (l.status = 'interested' OR l.is_interested = true)`,
        statusBaseParams
      );
      const demoDoneLeadsRes = await client.query(
        `SELECT COUNT(id)::int as count FROM leads l WHERE ${statusWhereClause} AND ${DEMO_DONE_LEAD_SQL}`,
        statusBaseParams
      );
      const rnrBucketCountsRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE ${RNR_COUNT_EXPR} = 1)::int as rnr_1,
           COUNT(*) FILTER (WHERE ${RNR_COUNT_EXPR} = 2)::int as rnr_2,
           COUNT(*) FILTER (WHERE ${RNR_COUNT_EXPR} = 3)::int as rnr_3,
           COUNT(*) FILTER (WHERE ${RNR_COUNT_EXPR} >= 4)::int as rnr_4
         FROM leads l
         WHERE ${statusWhereClause} AND (l.status = 'rnr' OR (l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} > 0))`,
        statusBaseParams
      );
      const effectiveNewRnrRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} = 0)::int as pure_new,
           COUNT(*) FILTER (WHERE l.status = 'rnr' OR (l.status IN ('new', 'uncontacted') AND ${RNR_COUNT_EXPR} > 0))::int as effective_rnr
         FROM leads l
         WHERE ${statusWhereClause}`,
        statusBaseParams
      );

      let unassignedTotal = 0;
      if (!isSalesRep(role)) {
        const unassignedParams: any[] = [tenantId];
        let unassignedCondition = "tenant_id = $1 AND assigned_rep_id IS NULL";
        if (vertical && vertical !== "all" && vertical !== "All Verticals") {
          unassignedCondition += ` AND business_vertical = $${unassignedParams.push(vertical)}`;
        }
        const unassignedRes = await client.query(
          `SELECT COUNT(id)::int as count FROM leads WHERE ${unassignedCondition}`,
          unassignedParams
        );
        unassignedTotal = unassignedRes.rows[0]?.count || 0;
      }

      const stats: Record<string, number> = {
        all: 0,
        new: 0,
        rnr: 0,
        rnr_1: rnrBucketCountsRes.rows[0]?.rnr_1 || 0,
        rnr_2: rnrBucketCountsRes.rows[0]?.rnr_2 || 0,
        rnr_3: rnrBucketCountsRes.rows[0]?.rnr_3 || 0,
        rnr_4: rnrBucketCountsRes.rows[0]?.rnr_4 || 0,
        callback: 0,
        demo_scheduled: 0,
        demo_done: 0,
        deal_created: 0,
        won: 0,
        lost: 0,
        not_interested: 0,
        invalid: 0,
        already_using: 0,
        already_purchased: 0,
        future_requirement: 0,
        interested: interestedLeadsRes.rows[0]?.count || 0,
        unassigned: unassignedTotal,
      };

      statusCountsRes.rows.forEach((s: { status: string; count: number }) => {
        stats[s.status] = s.count;
        stats.all += s.count;
      });
      stats.new = effectiveNewRnrRes.rows[0]?.pure_new ?? stats.new;
      stats.rnr = effectiveNewRnrRes.rows[0]?.effective_rnr ?? stats.rnr;
      stats.demo_done = demoDoneLeadsRes.rows[0]?.count || 0;

      const mappedLeads = leadsRes.rows.map((l) => {
        const effectiveStatus =
          (l.status === "new" || l.status === "uncontacted") && Number(l.rnrCount || 0) > 0
            ? "rnr"
            : l.status;
        return {
        id: l.id,
        tenantId: l.tenantId,
        assignedRepId: l.assignedRepId,
        assignedAt: l.assignedAt,
        firstAssignedRepId: isSalesRep(role) ? null : l.firstAssignedRepId,
        firstAssignedAt: isSalesRep(role) ? null : l.firstAssignedAt,
        phoneNumber: l.phoneNumber,
        contactName: l.contactName,
        companyName: l.companyName,
        websiteUrl: l.websiteUrl,
        businessVertical: l.businessVertical,
        serviceType: l.serviceType,
        source: l.source,
        status: effectiveStatus,
        rnrCount: l.rnrCount,
        isDemoDone: Boolean(l.isDemoDone),
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
        };
      });

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
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

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

    if (!phoneNumber || typeof phoneNumber !== "string" || !phoneNumber.trim()) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    let safeWebsiteUrl: string | null = null;
    if (typeof websiteUrl === "string" && websiteUrl.trim()) {
      const trimmedSite = websiteUrl.trim();
      const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedSite)
        ? trimmedSite
        : `https://${trimmedSite}`;
      const validated = sanitizeExternalUrl(candidate);
      if (!validated) {
        return NextResponse.json(
          { error: "Invalid website URL" },
          { status: 400 }
        );
      }
      safeWebsiteUrl = validated;
    }

    const initialRep = can(role, "leads:assign")
      ? assignedRepId && assignedRepId !== "unassigned"
        ? String(assignedRepId).trim()
        : null
      : repId;

    if (initialRep && !isValidUuid(initialRep)) {
      return NextResponse.json({ error: "Invalid assignedRepId" }, { status: 400 });
    }

    const metadata = {
      ...(preferredLanguage ? { preferredLanguage } : {}),
      ...(body.address ? { address: body.address } : {}),
    };

    return await withClient(async (client) => {
      if (initialRep) {
        const repCheck = await client.query(
          `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1`,
          [initialRep, tenantId]
        );
        if (repCheck.rows.length === 0) {
          return NextResponse.json(
            { error: "Selected representative not found or inactive in workspace." },
            { status: 400 }
          );
        }
      }

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
          phoneNumber.trim(),
          contactName || null,
          companyName || null,
          safeWebsiteUrl,
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

  try {
    const body = await request.json();
    const validLeadIds = filterValidUuids(body?.leadIds);

    if (validLeadIds.length === 0) {
      return NextResponse.json(
        { error: "No valid lead IDs provided for deletion" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        // Verify ownership within this tenant BEFORE touching any child tables
        const ownedRes = await client.query(
          "SELECT id FROM leads WHERE id = ANY($1::uuid[]) AND tenant_id = $2",
          [validLeadIds, tenantId]
        );
        const ownedIds = ownedRes.rows.map((r: any) => r.id);

        if (ownedIds.length === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "No matching leads found" }, { status: 404 });
        }

        await client.query("DELETE FROM call_logs WHERE lead_id = ANY($1::uuid[]) AND tenant_id = $2", [ownedIds, tenantId]);
        await client.query("DELETE FROM scheduled_tasks WHERE lead_id = ANY($1::uuid[]) AND tenant_id = $2", [ownedIds, tenantId]);
        await client.query("DELETE FROM payments WHERE lead_id = ANY($1::uuid[]) AND tenant_id = $2", [ownedIds, tenantId]);
        await client.query("DELETE FROM deals WHERE lead_id = ANY($1::uuid[]) AND tenant_id = $2", [ownedIds, tenantId]);
        await client.query("DELETE FROM lead_stage_history WHERE lead_id = ANY($1::uuid[]) AND tenant_id = $2", [ownedIds, tenantId]).catch(() => {});
        await client.query("DELETE FROM push_to_dial_jobs WHERE lead_id = ANY($1::uuid[]) AND tenant_id = $2", [ownedIds, tenantId]).catch(() => {});
        const res = await client.query(
          "DELETE FROM leads WHERE id = ANY($1::uuid[]) AND tenant_id = $2 RETURNING id",
          [ownedIds, tenantId]
        );
        await client.query("COMMIT");

        return NextResponse.json({
          success: true,
          count: res.rowCount || 0,
          message: `Permanently deleted ${res.rowCount || 0} leads.`,
        });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[LEADS_BULK_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete leads" },
      { status: 500 }
    );
  }
}
