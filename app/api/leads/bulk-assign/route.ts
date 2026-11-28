import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requireActiveSession } from "@/lib/auth";
import { filterValidUuids, isValidUuid } from "@/lib/security";

export async function POST(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.role || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.tenantId;
  const role = session.role;

  if (!can(role, "leads:assign")) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 2 (Manager) and Level 3 (Admin) can assign leads." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { repId, mode, repIds } = body;
    const leadIds = filterValidUuids(body?.leadIds);

    if (leadIds.length === 0) {
      return NextResponse.json(
        { error: "No valid lead IDs selected for assignment" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      // Mode 1: Round Robin Distribution
      if (mode === "round_robin") {
        const requestedRepIds = filterValidUuids(repIds);
        let targetRepIds: string[] = [];

        if (requestedRepIds.length > 0) {
          const verifiedRepsRes = await client.query(
            "SELECT id FROM users WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND is_active = true",
            [requestedRepIds, tenantId]
          );
          targetRepIds = verifiedRepsRes.rows.map((r: any) => r.id);
        } else {
          const activeRepsRes = await client.query(
            "SELECT id FROM users WHERE tenant_id = $1 AND role = 'sales_rep' AND is_active = true",
            [tenantId]
          );
          targetRepIds = activeRepsRes.rows.map((r: any) => r.id);
        }

        if (targetRepIds.length === 0) {
          return NextResponse.json(
            { error: "No active representatives available in this workspace for round-robin assignment." },
            { status: 400 }
          );
        }

        const repAssignments = leadIds.map((_, i) => targetRepIds[i % targetRepIds.length]);

        const updateRes = await client.query(
          `UPDATE leads AS l
           SET assigned_rep_id = v.rep_id,
               first_assigned_rep_id = COALESCE(l.first_assigned_rep_id, v.rep_id),
               first_assigned_at = COALESCE(l.first_assigned_at, NOW()),
               assigned_at = NOW(),
               status = CASE WHEN l.assigned_rep_id IS DISTINCT FROM v.rep_id THEN 'new' ELSE l.status END,
               rnr_count = CASE WHEN l.assigned_rep_id IS DISTINCT FROM v.rep_id THEN 0 ELSE l.rnr_count END,
               updated_at = NOW()
           FROM unnest($1::uuid[], $2::uuid[]) AS v(lead_id, rep_id)
           WHERE l.id = v.lead_id AND l.tenant_id = $3`,
          [leadIds, repAssignments, tenantId]
        );

        const assignedCount = updateRes.rowCount || 0;
        return NextResponse.json({
          success: true,
          count: assignedCount,
          message: `Distributed ${assignedCount} leads across ${targetRepIds.length} representatives.`,
        });
      }

      // Mode 2: Unassign Leads
      if (repId === null || repId === "unassigned") {
        const updateRes = await client.query(
          "UPDATE leads SET assigned_rep_id = NULL, assigned_at = NULL, updated_at = NOW() WHERE id = ANY($1::uuid[]) AND tenant_id = $2 RETURNING id",
          [leadIds, tenantId]
        );

        return NextResponse.json({
          success: true,
          count: updateRes.rowCount || 0,
          message: `Unassigned ${updateRes.rowCount || 0} leads.`,
        });
      }

      // Mode 3: Assign to specific representative
      if (isValidUuid(repId)) {
        const cleanRepId = repId.trim();
        const targetRepRes = await client.query(
          "SELECT id, full_name as \"fullName\" FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true",
          [cleanRepId, tenantId]
        );

        if (targetRepRes.rows.length === 0) {
          return NextResponse.json(
            { error: "Selected representative not found or inactive." },
            { status: 404 }
          );
        }

        const rep = targetRepRes.rows[0];

        const updateRes = await client.query(
          `UPDATE leads
           SET assigned_rep_id = $1,
               first_assigned_rep_id = COALESCE(first_assigned_rep_id, $1),
               first_assigned_at = COALESCE(first_assigned_at, NOW()),
               assigned_at = NOW(),
               status = CASE WHEN assigned_rep_id IS DISTINCT FROM $1 THEN 'new' ELSE status END,
               rnr_count = CASE WHEN assigned_rep_id IS DISTINCT FROM $1 THEN 0 ELSE rnr_count END,
               updated_at = NOW()
           WHERE id = ANY($2::uuid[]) AND tenant_id = $3
           RETURNING id`,
          [cleanRepId, leadIds, tenantId]
        );

        const totalCount = updateRes.rowCount || 0;

        return NextResponse.json({
          success: true,
          count: totalCount,
          message: `Assigned ${totalCount} leads to ${rep.fullName}.`,
        });
      }

      return NextResponse.json(
        { error: "Invalid assignment parameters provided." },
        { status: 400 }
      );
    });
  } catch (error) {
    console.error("[BULK_ASSIGN]", error);
    return NextResponse.json(
      { error: "Failed to perform bulk assignment." },
      { status: 500 }
    );
  }
}
