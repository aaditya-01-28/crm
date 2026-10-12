import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, isSalesRep } from "@/lib/rbac";
import { getSession } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  const isLevel1 = isSalesRep(role);
  const where: Record<string, unknown> = { id, tenantId };
  if (isLevel1) {
    where.assignedRepId = repId;
  }

  const lead = await prisma.lead.findFirst({
    where,
    include: {
      assignedRep: {
        select: { id: true, fullName: true, email: true },
      },
      ...(!isLevel1
        ? {
            firstAssignedRep: {
              select: { id: true, fullName: true, email: true },
            },
          }
        : {}),
      callLogs: {
        where: isLevel1 ? { repId } : undefined,
        orderBy: { callTimestamp: "desc" },
        include: {
          rep: { select: { fullName: true, email: true } },
        },
      },
      tasks: {
        orderBy: { scheduledTime: "desc" },
        include: {
          rep: { select: { fullName: true } },
        },
      },
      deals: {
        orderBy: { createdAt: "desc" },
        include: {
          rep: { select: { fullName: true } },
          payments: {
            select: {
              id: true,
              finalAmount: true,
              opsApprovalStatus: true,
              paymentMode: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const meta = (lead.customMetadata as Record<string, unknown>) || {};
  const preferredLanguage = (meta.preferredLanguage as string) || null;

  return NextResponse.json({
    lead: {
      ...lead,
      firstAssignedRepId: isLevel1 ? null : lead.firstAssignedRepId,
      firstAssignedAt: isLevel1 ? null : lead.firstAssignedAt,
      firstAssignedRep: isLevel1 ? null : (lead as any).firstAssignedRep || null,
      preferredLanguage,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const role = request.headers.get("x-user-role") || session?.role || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  try {
    const body = await request.json();
    const {
      contactName,
      companyName,
      phoneNumber,
      websiteUrl,
      businessVertical,
      serviceType,
      status,
      assignedRepId,
      preferredLanguage,
    } = body;

    const where: Record<string, unknown> = { id, tenantId };
    if (isSalesRep(role)) {
      where.assignedRepId = repId;
    }

    const existing = await prisma.lead.findFirst({ where });
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const existingMeta = (existing.customMetadata as Record<string, unknown>) || {};
    const newMetadata = {
      ...existingMeta,
      ...(preferredLanguage !== undefined ? { preferredLanguage: preferredLanguage || null } : {}),
    };

    if (preferredLanguage !== undefined) {
      await prisma.$executeRawUnsafe(
        'UPDATE "leads" SET "preferred_language" = $1 WHERE "id" = $2::uuid',
        preferredLanguage || null,
        id
      ).catch(() => {});
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        contactName: contactName !== undefined ? contactName : existing.contactName,
        companyName: companyName !== undefined ? companyName : existing.companyName,
        phoneNumber: phoneNumber !== undefined ? phoneNumber : existing.phoneNumber,
        websiteUrl: websiteUrl !== undefined ? websiteUrl : existing.websiteUrl,
        businessVertical: businessVertical !== undefined ? businessVertical : existing.businessVertical,
        serviceType: serviceType !== undefined ? serviceType : existing.serviceType,
        status: status !== undefined ? status : existing.status,
        customMetadata: newMetadata,
        assignedRepId:
          can(role, "leads:assign") && assignedRepId !== undefined
            ? assignedRepId === "" || assignedRepId === "unassigned"
              ? null
              : assignedRepId
            : existing.assignedRepId,
        firstAssignedRepId:
          existing.firstAssignedRepId ||
          (can(role, "leads:assign") && assignedRepId && assignedRepId !== "unassigned" && assignedRepId !== ""
            ? assignedRepId
            : existing.firstAssignedRepId),
        firstAssignedAt:
          existing.firstAssignedAt ||
          (!existing.firstAssignedRepId && can(role, "leads:assign") && assignedRepId && assignedRepId !== "unassigned" && assignedRepId !== ""
            ? new Date()
            : existing.firstAssignedAt),
        updatedAt: new Date(),
      },
      include: {
        assignedRep: { select: { id: true, fullName: true } },
        firstAssignedRep: { select: { id: true, fullName: true } },
      },
    });

    // Auto-sync deal pipeline if status changed to demo stages
    if (status === "demo_done" || status === "demo_scheduled") {
      const existingDeal = await prisma.deal.findFirst({
        where: { leadId: id, tenantId },
      });

      if (existingDeal) {
        await prisma.deal.update({
          where: { id: existingDeal.id },
          data: { stage: status, updatedAt: new Date() },
        });
      } else {
        await prisma.deal.create({
          data: {
            tenantId,
            leadId: id,
            repId: updated.assignedRepId || repId,
            serviceType: updated.serviceType || "WhatsApp API",
            quantity: 10000,
            quotedPrice: 0,
            stage: status,
            closingNotes: status === "demo_done" ? "Product demo completed" : "Product demo scheduled",
          },
        });
      }

      if (status === "demo_done") {
        await prisma.scheduledTask.updateMany({
          where: { leadId: id, taskType: "product_demo", status: "pending" },
          data: { status: "completed", updatedAt: new Date() },
        });
      }
    }

    const updatedMeta = (updated.customMetadata as Record<string, unknown>) || {};
    const finalLang = (updatedMeta.preferredLanguage as string) || null;
    const isLevel1 = isSalesRep(role);
    return NextResponse.json({
      lead: {
        ...updated,
        firstAssignedRepId: isLevel1 ? null : updated.firstAssignedRepId,
        firstAssignedAt: isLevel1 ? null : updated.firstAssignedAt,
        firstAssignedRep: isLevel1 ? null : updated.firstAssignedRep,
        preferredLanguage: finalLang,
      },
    });
  } catch (error) {
    console.error("[LEAD PATCH]", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}
