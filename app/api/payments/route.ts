import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const role = request.headers.get("x-user-role")!;
  const repId = request.headers.get("x-user-id")!;

  const { searchParams } = new URL(request.url);
  const opsStatus = searchParams.get("status") || "pending_verification";

  const where: Record<string, unknown> = { tenantId };

  // Accounts ops see all; reps only see their own
  if (role === "sales_rep") {
    where.repId = repId;
  } else {
    where.opsApprovalStatus = opsStatus;
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      deal: { select: { serviceType: true, quotedPrice: true } },
      lead: { select: { contactName: true, companyName: true, phoneNumber: true } },
      rep: { select: { fullName: true, email: true } },
      approver: { select: { fullName: true } },
    },
  });

  return NextResponse.json({ payments });
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const repId = request.headers.get("x-user-id")!;

  try {
    const body = await request.json();
    const {
      dealId,
      leadId,
      userType,
      panelUserId,
      creditsToAdd,
      originalAmount,
      taxAmount,
      tdsAmount,
      finalAmount,
      paymentMode,
      gstin,
      screenshotUrl,
    } = body;

    const payment = await prisma.payment.create({
      data: {
        tenantId,
        dealId,
        leadId,
        repId,
        userType,
        panelUserId,
        creditsToAdd,
        originalAmount,
        taxAmount,
        tdsAmount: tdsAmount || 0,
        finalAmount,
        paymentMode,
        gstin: gstin || null,
        screenshotUrl,
      },
    });

    // Move deal to payment_pending if not already won
    await prisma.deal.update({
      where: { id: dealId },
      data: { stage: "payment_pending" },
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("[PAYMENTS POST]", error);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
