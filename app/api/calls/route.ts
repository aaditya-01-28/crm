import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;
  const role = request.headers.get("x-user-role")!;
  const { searchParams } = new URL(request.url);

  const leadId = searchParams.get("leadId");
  const filterRepId = searchParams.get("repId");
  const disposition = searchParams.get("disposition");
  const search = searchParams.get("search")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const where: Prisma.CallLogWhereInput = { tenantId };

  if (role === "sales_rep") {
    where.repId = repId;
  } else if (filterRepId && filterRepId !== "all") {
    where.repId = filterRepId;
  }

  if (leadId) {
    where.leadId = leadId;
  }

  if (disposition && disposition !== "all") {
    where.disposition = disposition;
  }

  if (dateFrom || dateTo) {
    where.callTimestamp = {};
    if (dateFrom) {
      where.callTimestamp.gte = new Date(dateFrom);
    }
    if (dateTo) {
      const end = new Date(dateTo);
      if (dateTo.length <= 10) {
        end.setHours(23, 59, 59, 999);
      }
      where.callTimestamp.lte = end;
    }
  }

  if (search) {
    where.OR = [
      { lead: { phoneNumber: { contains: search, mode: "insensitive" } } },
      { lead: { contactName: { contains: search, mode: "insensitive" } } },
      { lead: { companyName: { contains: search, mode: "insensitive" } } },
      { remark: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [total, calls, stats] = await Promise.all([
      prisma.callLog.count({ where }),
      prisma.callLog.findMany({
        where,
        orderBy: { callTimestamp: "desc" },
        skip,
        take: limit,
        include: {
          lead: {
            select: {
              id: true,
              phoneNumber: true,
              contactName: true,
              companyName: true,
              businessVertical: true,
              status: true,
            },
          },
          rep: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      prisma.callLog.aggregate({
        where,
        _sum: { durationSeconds: true },
        _count: { id: true },
      }),
    ]);

    // Count connected calls for metrics
    const connectedCount = await prisma.callLog.count({
      where: {
        ...where,
        disposition: "Connected",
      },
    });

    const totalDuration = stats._sum.durationSeconds || 0;
    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
    const connectedRate = total > 0 ? Math.round((connectedCount / total) * 100) : 0;

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
  } catch (error) {
    console.error("[CALLS GET]", error);
    return NextResponse.json({ error: "Failed to retrieve call logs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;

  try {
    const body = await request.json();

    // Check if this is a batch sync from Android companion app
    const items = Array.isArray(body.calls) ? body.calls : [body];
    const createdLogs = [];

    for (const item of items) {
      let targetLeadId = item.leadId;
      const phoneNumber = item.phoneNumber ? String(item.phoneNumber).trim() : null;
      const durationSeconds =
        typeof item.durationSeconds === "number" ? Math.max(0, item.durationSeconds) : 0;
      const disposition = item.disposition || (durationSeconds > 0 ? "Connected" : "RNR");
      const remark = item.remark || null;
      const callTimestamp = item.callTimestamp ? new Date(item.callTimestamp) : new Date();

      // If leadId is not provided, look up or create lead by phone number
      if (!targetLeadId && phoneNumber) {
        const cleanDigits = phoneNumber.replace(/\D/g, "");
        const searchSuffix = cleanDigits.slice(-10);

        let existingLead = await prisma.lead.findFirst({
          where: {
            tenantId,
            phoneNumber: { contains: searchSuffix },
          },
        });

        if (!existingLead) {
          existingLead = await prisma.lead.create({
            data: {
              tenantId,
              phoneNumber,
              assignedRepId: repId,
              source: "Mobile Dialer App",
              status: disposition === "Connected" ? "callback" : "new",
            },
          });
        }
        targetLeadId = existingLead.id;
      }

      if (!targetLeadId) {
        continue;
      }

      const log = await prisma.callLog.create({
        data: {
          tenantId,
          leadId: targetLeadId,
          repId,
          disposition,
          durationSeconds,
          remark,
          callTimestamp,
        },
      });

      // Update lead metadata / rnrCount
      if (disposition === "RNR") {
        await prisma.lead
          .update({
            where: { id: targetLeadId },
            data: {
              rnrCount: { increment: 1 },
              updatedAt: new Date(),
            },
          })
          .catch(() => {});
      } else {
        await prisma.lead
          .update({
            where: { id: targetLeadId },
            data: { updatedAt: new Date() },
          })
          .catch(() => {});
      }

      createdLogs.push(log);
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
  } catch (error) {
    console.error("[CALLS POST]", error);
    return NextResponse.json(
      { error: "Failed to record call log" },
      { status: 500 }
    );
  }
}
