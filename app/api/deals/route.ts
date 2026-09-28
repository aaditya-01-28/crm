import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;
  const role = request.headers.get("x-user-role")!;

  const where: Record<string, unknown> = { tenantId };
  if (role === "sales_rep") where.repId = repId;

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: "desc" },
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

  return NextResponse.json({ deals });
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;

  try {
    const body = await request.json();
    const deal = await prisma.deal.create({
      data: {
        tenantId,
        leadId: body.leadId,
        repId,
        serviceType: body.serviceType,
        quantity: body.quantity,
        quotedPrice: body.quotedPrice,
        expectedClosingDate: body.expectedClosingDate
          ? new Date(body.expectedClosingDate)
          : null,
        stage: body.stage || "quote_sent",
        closingNotes: body.closingNotes || null,
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

    // Update lead status to deal_created
    await prisma.lead.update({
      where: { id: body.leadId },
      data: { status: "deal_created" },
    });

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("[DEALS POST]", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
