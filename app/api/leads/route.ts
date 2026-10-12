import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, isSalesRep } from "@/lib/rbac";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status");
  const vertical = searchParams.get("vertical");
  const search = searchParams.get("search")?.trim();
  const filterRepId = searchParams.get("repId");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
  const queue = searchParams.get("queue") === "true"; // next dialer lead

  // Queue mode for fast calling console
  if (queue) {
    const queueWhere: Record<string, unknown> = {
      tenantId,
      assignedRepId: repId,
      OR: [
        { status: "new" },
        { status: "rnr", rnrCount: { lt: 3 } },
      ],
    };

    const lead = await prisma.lead.findFirst({
      where: queueWhere,
      orderBy: [{ rnrCount: "asc" }, { createdAt: "asc" }],
      include: {
        assignedRep: { select: { fullName: true } },
        _count: { select: { callLogs: true } },
      },
    });
    return NextResponse.json({ lead });
  }

  // Base scope: sales reps see their own leads; admins/managers see all tenant leads
  const baseWhere: Record<string, unknown> = { tenantId };

  if (isSalesRep(role)) {
    baseWhere.assignedRepId = repId;
  } else if (filterRepId) {
    if (filterRepId === "unassigned") {
      baseWhere.assignedRepId = null;
    } else {
      baseWhere.assignedRepId = filterRepId;
    }
  }

  // Filter criteria for list
  const where: Record<string, unknown> = { ...baseWhere };

  if (status && status !== "all") {
    where.status = status;
  }

  if (vertical && vertical !== "all") {
    where.businessVertical = vertical;
  }

  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
      { phoneNumber: { contains: search } },
      { businessVertical: { contains: search, mode: "insensitive" } },
      { serviceType: { contains: search, mode: "insensitive" } },
    ];
  }

  // Fetch paginated leads, total count, status statistics, and unassigned count concurrently
  const [leads, total, statusCounts, unassignedTotal] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        assignedRep: { select: { id: true, fullName: true } },
        ...(isSalesRep(role)
          ? {}
          : {
              firstAssignedRep: { select: { id: true, fullName: true } },
            }),
        callLogs: {
          take: 1,
          orderBy: { callTimestamp: "desc" },
          select: {
            disposition: true,
            remark: true,
            durationSeconds: true,
            callTimestamp: true,
            rep: { select: { fullName: true } },
          },
        },
        _count: {
          select: {
            callLogs: true,
            tasks: true,
            deals: true,
          },
        },
      },
    }),
    prisma.lead.count({ where }),
    prisma.lead.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { id: true },
    }),
    role !== "sales_rep"
      ? prisma.lead.count({ where: { tenantId, assignedRepId: null } })
      : Promise.resolve(0),
  ]);

  // Transform status counts into a handy key-value map
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
    unassigned: unassignedTotal,
  };

  statusCounts.forEach((s) => {
    stats[s.status] = s._count.id;
    stats.all += s._count.id;
  });

  const mappedLeads = leads.map((l) => ({
    ...l,
    preferredLanguage:
      ((l.customMetadata as Record<string, unknown>)?.preferredLanguage as string) || null,
  }));

  return NextResponse.json({
    leads: mappedLeads,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    stats,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  if (!tenantId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 2 (Manager) and Level 3 (Admin) can create leads
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

    const lead = await prisma.lead.create({
      data: {
        tenantId,
        assignedRepId: initialRep,
        firstAssignedRepId: initialRep || null,
        firstAssignedAt: initialRep ? new Date() : null,
        phoneNumber,
        contactName: contactName || null,
        companyName: companyName || null,
        websiteUrl: websiteUrl || null,
        businessVertical: businessVertical || null,
        serviceType: serviceType || null,
        source: source || "Manual Entry",
        status: "new",
        customMetadata: preferredLanguage ? { preferredLanguage } : {},
      },
      include: {
        assignedRep: { select: { fullName: true } },
        firstAssignedRep: { select: { fullName: true } },
      },
    });

    if (preferredLanguage) {
      await prisma.$executeRawUnsafe(
        'UPDATE "leads" SET "preferred_language" = $1 WHERE "id" = $2::uuid',
        preferredLanguage,
        lead.id
      ).catch(() => {});
    }

    return NextResponse.json(
      {
        lead: {
          ...lead,
          preferredLanguage: preferredLanguage || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[LEADS POST]", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
