import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can, normalizeRole } from "@/lib/rbac";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  const headerTenantId = request.headers.get("x-tenant-id");
  const headerRole = request.headers.get("x-user-role");

  const tenantId = headerTenantId || session?.tenantId;
  const role = headerRole || session?.role;

  if (!tenantId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(role, "leads:assign")) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 2 (Manager) and Level 3 (Admin) can assign leads." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { leadIds, repId, mode, repIds } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: "No leads selected for assignment" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      // Mode 1: Round Robin Distribution
      if (mode === "round_robin") {
        let targetRepIds: string[] = Array.isArray(repIds) ? repIds.filter(Boolean) : [];

        if (targetRepIds.length === 0) {
          const activeRepsRes = await client.query(
            "SELECT id FROM users WHERE tenant_id = $1 AND role = 'sales_rep' AND is_active = true",
            [tenantId]
          );
          targetRepIds = activeRepsRes.rows.map((r: any) => r.id);
        }

        if (targetRepIds.length === 0) {
          return NextResponse.json(
            { error: "No active sales representatives available for round-robin assignment." },
            { status: 400 }
          );
        }

        for (let i = 0; i < leadIds.length; i++) {
          const assignedTo = targetRepIds[i % targetRepIds.length];
          const leadId = leadIds[i];

          await client.query(
            `UPDATE leads
             SET assigned_rep_id = $1,
                 first_assigned_rep_id = COALESCE(first_assigned_rep_id, $1),
                 first_assigned_at = COALESCE(first_assigned_at, NOW()),
                 updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3`,
            [assignedTo, leadId, tenantId]
          );
        }

        return NextResponse.json({
          success: true,
          count: leadIds.length,
          message: `Distributed ${leadIds.length} leads across ${targetRepIds.length} representatives.`,
        });
      }

      // Mode 2: Unassign Leads
      if (repId === null || repId === "unassigned") {
        const updateRes = await client.query(
          "UPDATE leads SET assigned_rep_id = NULL, updated_at = NOW() WHERE id = ANY($1::uuid[]) AND tenant_id = $2 RETURNING id",
          [leadIds, tenantId]
        );

        return NextResponse.json({
          success: true,
          count: updateRes.rowCount || 0,
          message: `Unassigned ${updateRes.rowCount || 0} leads.`,
        });
      }

      // Mode 3: Assign to specific representative
      if (typeof repId === "string" && repId.trim()) {
        const targetRepRes = await client.query(
          "SELECT id, full_name as \"fullName\" FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true",
          [repId, tenantId]
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
               updated_at = NOW()
           WHERE id = ANY($2::uuid[]) AND tenant_id = $3
           RETURNING id`,
          [repId, leadIds, tenantId]
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
