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
    const { stage, closingNotes, quotedPrice, expectedClosingDate } = body;

    const deal = await prisma.deal.findFirst({ where: { id, tenantId } });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        stage: stage || deal.stage,
        closingNotes:
          closingNotes !== undefined ? closingNotes : deal.closingNotes,
        quotedPrice: quotedPrice !== undefined ? quotedPrice : deal.quotedPrice,
        expectedClosingDate: expectedClosingDate
          ? new Date(expectedClosingDate)
          : deal.expectedClosingDate,
        updatedAt: new Date(),
      },
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

    // Update lead status if deal is won/lost
    if (stage === "closed_won") {
      await prisma.lead.update({
        where: { id: deal.leadId },
        data: { status: "won" },
      });
    } else if (stage === "closed_lost") {
      await prisma.lead.update({
        where: { id: deal.leadId },
        data: { status: "lost" },
      });
    }

    // Signal frontend to open Payment Modal
    const triggerPaymentModal =
      stage === "payment_pending" || stage === "closed_won";

    return NextResponse.json({ deal: updated, triggerPaymentModal });
  } catch (error) {
    console.error("[DEALS PATCH]", error);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenantId = request.headers.get("x-tenant-id")!;
  const role = request.headers.get("x-user-role")!;

  if (!["super_admin", "sales_manager"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deal = await prisma.deal.findFirst({ where: { id, tenantId } });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  await prisma.deal.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
