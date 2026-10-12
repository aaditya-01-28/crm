import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/auth";

interface ImportedLead {
  phone: string | number;
  name?: string;
  company?: string;
  vertical?: string;
  service?: string;
  source?: string;
}

function cleanPhoneNumber(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let str = String(raw).trim();
  // Handle Excel decimals like 9876543210.0
  if (str.includes(".") && !str.toLowerCase().includes("e")) {
    str = str.split(".")[0];
  }
  // Strip all non-digits
  const digits = str.replace(/\D/g, "");
  // Take the last 10 digits (handles +91, 91, 0 prefixes)
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId;
  const repId = request.headers.get("x-user-id") || session?.sub;
  const role = request.headers.get("x-user-role") || session?.role;

  if (!tenantId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 2 (Manager) and Level 3 (Admin) can import leads
  if (!can(role, "leads:import")) {
    return NextResponse.json(
      { error: "Forbidden: Only managers and admins can import leads" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      leads,
      assignToRepId,
      assignmentMode,
    }: {
      leads: ImportedLead[];
      assignToRepId?: string | null;
      assignmentMode?: "unassigned" | "specific" | "round_robin";
    } = body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    // Normalize phone numbers and reject invalid rows
    const processed = leads.map((l) => ({
      ...l,
      phone: cleanPhoneNumber(l.phone),
    }));

    const validLeads = processed.filter((l) => l.phone.length === 10);

    if (validLeads.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid 10-digit phone numbers detected. Please ensure your sheet contains 10-digit mobile numbers.",
        },
        { status: 400 }
      );
    }

    // De-duplicate within the uploaded batch itself (keep first occurrence)
    const seenInBatch = new Set<string>();
    const batchUnique: typeof validLeads = [];
    let batchDuplicatesCount = 0;

    for (const item of validLeads) {
      if (seenInBatch.has(item.phone)) {
        batchDuplicatesCount++;
      } else {
        seenInBatch.add(item.phone);
        batchUnique.push(item);
      }
    }

    // Check existing phone numbers in database for this tenant
    const existing = await prisma.lead.findMany({
      where: {
        tenantId,
        phoneNumber: { in: batchUnique.map((l) => l.phone) },
      },
      select: { phoneNumber: true },
    });
    const existingPhones = new Set(existing.map((e) => e.phoneNumber));

    const newLeads = batchUnique.filter((l) => !existingPhones.has(l.phone));

    if (newLeads.length === 0) {
      return NextResponse.json({
        imported: 0,
        duplicates: batchUnique.length + batchDuplicatesCount,
        invalid: leads.length - validLeads.length,
        total: leads.length,
        message: "All phone numbers in this file already exist in your CRM database",
      });
    }

    // Determine target rep assignment
    let roundRobinReps: string[] = [];
    if (assignmentMode === "round_robin") {
      const activeReps = await prisma.user.findMany({
        where: { tenantId, role: "sales_rep", isActive: true },
        select: { id: true },
      });
      roundRobinReps = activeReps.map((r) => r.id);
    }

    let defaultTargetRep: string | null = null;
    if (assignmentMode === "specific" && assignToRepId && assignToRepId !== "unassigned") {
      const targetUser = await prisma.user.findFirst({
        where: { id: assignToRepId, tenantId, isActive: true },
        select: { id: true },
      });
      if (targetUser) {
        defaultTargetRep = targetUser.id;
      }
    }

    // Batch insert new leads (leaving optional fields blank if empty)
    const result = await prisma.lead.createMany({
      data: newLeads.map((l, index) => {
        let assignedId: string | null = null;
        if (roundRobinReps.length > 0) {
          assignedId = roundRobinReps[index % roundRobinReps.length];
        } else {
          assignedId = defaultTargetRep;
        }

        return {
          tenantId,
          assignedRepId: assignedId,
          firstAssignedRepId: assignedId,
          firstAssignedAt: assignedId ? new Date() : null,
          phoneNumber: l.phone,
          contactName: l.name && l.name.trim() !== "" ? l.name.trim() : null,
          companyName: l.company && l.company.trim() !== "" ? l.company.trim() : null,
          businessVertical: l.vertical && l.vertical.trim() !== "" ? l.vertical.trim() : null,
          serviceType: l.service && l.service.trim() !== "" ? l.service.trim() : null,
          source: l.source || "Vendor Cold List",
          status: "new",
        };
      }),
      skipDuplicates: true,
    });

    return NextResponse.json({
      imported: result.count,
      duplicates: existingPhones.size + batchDuplicatesCount,
      invalid: leads.length - validLeads.length,
      total: leads.length,
    });
  } catch (error) {
    console.error("[IMPORT]", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
