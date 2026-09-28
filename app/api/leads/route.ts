import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;
  const role = request.headers.get("x-user-role")!;
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const queue = searchParams.get("queue") === "true"; // next dialer lead

  const where: Record<string, unknown> = { tenantId };

  // Reps only see their assigned leads; managers/admins see all
  if (role === "sales_rep") {
    where.assignedRepId = repId;
  }

  if (status) {
    where.status = status;
  }

  if (queue) {
    // Return the next unworked lead (new or rnr with <3 attempts)
    const lead = await prisma.lead.findFirst({
      where: {
        tenantId,
        assignedRepId: repId,
        OR: [
          { status: "new" },
          { status: "rnr", rnrCount: { lt: 3 } },
        ],
      },
      orderBy: [{ rnrCount: "asc" }, { createdAt: "asc" }],
      include: {
        assignedRep: { select: { fullName: true } },
        _count: { select: { callLogs: true } },
      },
    });
    return NextResponse.json({ lead });
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        assignedRep: { select: { fullName: true } },
        _count: { select: { callLogs: true, tasks: true, deals: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({ leads, total, page, limit });
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;

  try {
    const body = await request.json();
    const lead = await prisma.lead.create({
      data: {
        tenantId,
        assignedRepId: repId,
        phoneNumber: body.phoneNumber,
        contactName: body.contactName,
        companyName: body.companyName,
        websiteUrl: body.websiteUrl,
        businessVertical: body.businessVertical,
        serviceType: body.serviceType,
        source: body.source || "Manual Entry",
      },
    });
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error("[LEADS POST]", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
