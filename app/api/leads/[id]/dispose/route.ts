import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;

  try {
    const body = await request.json();
    const {
      disposition,
      remark,
      callbackDatetime,
      demoDuration,
      demoDatetime,
      decisionMakerName,
      meetingLink,
      durationSeconds = 0,
    } = body;

    if (!disposition) {
      return NextResponse.json(
        { error: "disposition is required" },
        { status: 400 }
      );
    }

    // Validate lead belongs to tenant
    const lead = await prisma.lead.findFirst({
      where: { id, tenantId },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Map disposition to lead status & additional actions
    let newStatus = lead.status;
    let rnrCount = lead.rnrCount;
    const tasksToCreate: Parameters<typeof prisma.scheduledTask.create>[0]["data"][] = [];

    switch (disposition) {
      case "RNR":
        newStatus = "rnr";
        rnrCount += 1;
        break;
      case "Not Interested":
        newStatus = "not_interested";
        break;
      case "Invalid":
      case "Switched Off":
        newStatus = "invalid";
        break;
      case "Already Using":
        newStatus = "already_using";
        break;
      case "Connected":
        newStatus = "callback"; // keep in active queue
        break;
      case "Callback":
        newStatus = "callback";
        if (callbackDatetime) {
          tasksToCreate.push({
            tenantId,
            leadId: id,
            repId,
            taskType: "callback",
            scheduledTime: new Date(callbackDatetime),
            notes: remark || null,
          });
        }
        break;
      case "Demo Scheduled":
        newStatus = "demo_scheduled";
        if (demoDatetime) {
          tasksToCreate.push({
            tenantId,
            leadId: id,
            repId,
            taskType: "product_demo",
            scheduledTime: new Date(demoDatetime),
            meetingLink: meetingLink || null,
            notes: decisionMakerName
              ? `Decision Maker: ${decisionMakerName}`
              : null,
          });
        }
        break;
    }

    // Transactionally update lead + create call log + create tasks
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data: { status: newStatus, rnrCount, updatedAt: new Date() },
      });

      await tx.callLog.create({
        data: {
          tenantId,
          leadId: id,
          repId,
          disposition,
          durationSeconds,
          remark: remark || null,
        },
      });

      for (const taskData of tasksToCreate) {
        await tx.scheduledTask.create({ data: taskData });
      }
    });

    // Fetch next queued lead for this rep
    const nextLead = await prisma.lead.findFirst({
      where: {
        tenantId,
        assignedRepId: repId,
        id: { not: id },
        OR: [{ status: "new" }, { status: "rnr", rnrCount: { lt: 3 } }],
      },
      orderBy: [{ rnrCount: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ success: true, nextLead });
  } catch (error) {
    console.error("[DISPOSE]", error);
    return NextResponse.json(
      { error: "Failed to log disposition" },
      { status: 500 }
    );
  }
}
