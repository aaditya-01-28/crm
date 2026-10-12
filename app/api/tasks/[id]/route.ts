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

    // If a product_demo task was marked completed, sync pipeline to 'demo_done'
    if (task.taskType === "product_demo" && status === "completed") {
      const lead = await prisma.lead.findUnique({ where: { id: task.leadId } });
      if (lead) {
        // Update lead status to demo_done
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "demo_done", updatedAt: new Date() },
        });

        // Upsert deal in deals table with stage 'demo_done'
        const existingDeal = await prisma.deal.findFirst({
          where: { leadId: lead.id, tenantId },
        });

        if (existingDeal) {
          await prisma.deal.update({
            where: { id: existingDeal.id },
            data: { stage: "demo_done", updatedAt: new Date() },
          });
        } else {
          await prisma.deal.create({
            data: {
              tenantId,
              leadId: lead.id,
              repId: lead.assignedRepId || task.repId,
              serviceType: lead.serviceType || "WhatsApp API",
              quantity: 10000,
              quotedPrice: 0,
              stage: "demo_done",
              closingNotes: "Product demo completed",
            },
          });
        }

        // Record activity log
        await prisma.callLog.create({
          data: {
            tenantId,
            leadId: lead.id,
            repId: task.repId,
            disposition: "Demo Done",
            durationSeconds: 0,
            remark: "Product demo completed and moved to pipeline.",
          },
        });
      }
    }

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("[TASKS PATCH]", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
