import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";

interface ImportedLead {
  phone: string;
  name?: string;
  company?: string;
  vertical?: string;
  source?: string;
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;

  try {
    const body = await request.json();
    const { leads }: { leads: ImportedLead[] } = body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    // Normalize phone numbers
    const normalized = leads
      .map((l) => ({
        ...l,
        phone: normalizePhone(l.phone || ""),
      }))
      .filter((l) => l.phone.length === 10); // valid 10-digit numbers only

    // Get existing phone numbers for this tenant (deduplication)
    const existing = await prisma.lead.findMany({
      where: {
        tenantId,
        phoneNumber: { in: normalized.map((l) => l.phone) },
      },
      select: { phoneNumber: true },
    });
    const existingPhones = new Set(existing.map((e) => e.phoneNumber));

    const newLeads = normalized.filter((l) => !existingPhones.has(l.phone));

    if (newLeads.length === 0) {
      return NextResponse.json({
        imported: 0,
        duplicates: normalized.length,
        message: "All leads already exist in the database",
      });
    }

    const result = await prisma.lead.createMany({
      data: newLeads.map((l) => ({
        tenantId,
        assignedRepId: repId,
        phoneNumber: l.phone,
        contactName: l.name || null,
        companyName: l.company || null,
        businessVertical: l.vertical || null,
        source: l.source || "Vendor Cold List",
        status: "new",
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      imported: result.count,
      duplicates: normalized.length - result.count,
      invalid: leads.length - normalized.length,
      total: leads.length,
    });
  } catch (error) {
    console.error("[IMPORT]", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
