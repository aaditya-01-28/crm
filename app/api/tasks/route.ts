import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;
  const role = request.headers.get("x-user-role")!;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const where: Record<string, unknown> = {
    tenantId,
    status: "pending",
  };

  if (role === "sales_rep") {
    where.repId = repId;
  }

  const tasks = await prisma.scheduledTask.findMany({
    where,
    orderBy: { scheduledTime: "asc" },
    include: {
      lead: {
        select: {
          phoneNumber: true,
          contactName: true,
          companyName: true,
          businessVertical: true,
        },
      },
      rep: { select: { fullName: true } },
    },
  });

  // Partition into unconfirmed (TBD) / overdue / today / upcoming
  const unconfirmed = tasks.filter((t) => !t.scheduledTime);
  const scheduled = tasks.filter((t) => t.scheduledTime !== null);

  const overdue = scheduled.filter((t) => t.scheduledTime! < startOfDay);
  const today = scheduled.filter(
    (t) => t.scheduledTime! >= startOfDay && t.scheduledTime! <= endOfDay
  );
  const upcoming = scheduled.filter((t) => t.scheduledTime! > endOfDay);

  return NextResponse.json({ unconfirmed, overdue, today, upcoming });
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;

  try {
    const body = await request.json();
    const task = await prisma.scheduledTask.create({
      data: {
        tenantId,
        leadId: body.leadId,
        repId,
        taskType: body.taskType,
        scheduledTime: body.scheduledTime ? new Date(body.scheduledTime) : null,
        meetingLink: body.meetingLink || null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("[TASKS POST]", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
