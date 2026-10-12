import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  // Level 1 (sales_rep) cannot assign leads; Level 2 (Manager) and Level 3 (Admin) can
  if (!can(role, "leads:assign")) {
    console.warn("[BULK_ASSIGN FORBIDDEN]", {
      role,
      normalizedRole: normalizeRole(role),
      headerRole,
      sessionRole: session?.role,
      userEmail: session?.email,
    });
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

    // Mode 1: Round Robin Distribution among selected/all reps
    if (mode === "round_robin") {
      let targetRepIds: string[] = Array.isArray(repIds) ? repIds.filter(Boolean) : [];

      // If no explicit rep IDs provided, fetch all active sales reps in this tenant
      if (targetRepIds.length === 0) {
        const activeReps = await prisma.user.findMany({
          where: { tenantId, role: "sales_rep", isActive: true },
          select: { id: true },
        });
        targetRepIds = activeReps.map((r) => r.id);
      }

      if (targetRepIds.length === 0) {
        return NextResponse.json(
          { error: "No active sales representatives available for round-robin assignment." },
          { status: 400 }
        );
      }

      // Distribute evenly
      const now = new Date();
      const updates = leadIds.flatMap((id: string, index: number) => {
        const assignedTo = targetRepIds[index % targetRepIds.length];
        return [
          prisma.lead.updateMany({
            where: { id, tenantId, firstAssignedRepId: null },
            data: {
              assignedRepId: assignedTo,
              firstAssignedRepId: assignedTo,
              firstAssignedAt: now,
              updatedAt: now,
            },
          }),
          prisma.lead.updateMany({
            where: { id, tenantId, firstAssignedRepId: { not: null } },
            data: {
              assignedRepId: assignedTo,
              updatedAt: now,
            },
          }),
        ];
      });

      await prisma.$transaction(updates);

      return NextResponse.json({
        success: true,
        count: leadIds.length,
        message: `Distributed ${leadIds.length} leads across ${targetRepIds.length} representatives.`,
      });
    }

    // Mode 2: Unassign Leads
    if (repId === null || repId === "unassigned") {
      const result = await prisma.lead.updateMany({
        where: { id: { in: leadIds }, tenantId },
        data: { assignedRepId: null, updatedAt: new Date() },
      });

      return NextResponse.json({
        success: true,
        count: result.count,
        message: `Unassigned ${result.count} leads.`,
      });
    }

    // Mode 3: Assign to specific representative
    if (typeof repId === "string" && repId.trim()) {
      // Verify representative exists in this tenant
      const targetRep = await prisma.user.findFirst({
        where: { id: repId, tenantId, isActive: true },
        select: { id: true, fullName: true },
      });

      if (!targetRep) {
        return NextResponse.json(
          { error: "Selected representative not found or inactive." },
          { status: 404 }
        );
      }

      const now = new Date();
      const [newResult, reassignResult] = await prisma.$transaction([
        prisma.lead.updateMany({
          where: { id: { in: leadIds }, tenantId, firstAssignedRepId: null },
          data: {
            assignedRepId: repId,
            firstAssignedRepId: repId,
            firstAssignedAt: now,
            updatedAt: now,
          },
        }),
        prisma.lead.updateMany({
          where: { id: { in: leadIds }, tenantId, firstAssignedRepId: { not: null } },
          data: {
            assignedRepId: repId,
            updatedAt: now,
          },
        }),
      ]);

      const totalCount = newResult.count + reassignResult.count;

      return NextResponse.json({
        success: true,
        count: totalCount,
        message: `Assigned ${totalCount} leads to ${targetRep.fullName}.`,
      });
    }

    return NextResponse.json(
      { error: "Invalid assignment parameters provided." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[BULK_ASSIGN]", error);
    return NextResponse.json(
      { error: "Failed to perform bulk assignment." },
      { status: 500 }
    );
  }
}
