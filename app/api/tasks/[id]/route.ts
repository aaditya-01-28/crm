import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenantId = request.headers.get("x-tenant-id")!;

  try {
    const body = await request.json();
    const { status, notes, meetingLink, scheduledTime } = body;

    const task = await prisma.scheduledTask.findFirst({
      where: { id, tenantId },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updated = await prisma.scheduledTask.update({
      where: { id },
      data: {
        status: status || task.status,
        notes: notes !== undefined ? notes : task.notes,
        meetingLink: meetingLink !== undefined ? meetingLink : task.meetingLink,
        scheduledTime: scheduledTime
          ? new Date(scheduledTime)
          : task.scheduledTime,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("[TASKS PATCH]", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
