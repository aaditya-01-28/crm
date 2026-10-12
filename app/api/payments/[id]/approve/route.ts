import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenantId = request.headers.get("x-tenant-id")!;
  const approverId = request.headers.get("x-user-id")!;
  const role = request.headers.get("x-user-role")!;

  if (!["super_admin", "accounts_ops", "sales_manager"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { status } = body; // 'approved' | 'rejected'

    const payment = await prisma.payment.findFirst({ where: { id, tenantId } });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        opsApprovalStatus: status,
        approvedBy: approverId,
        creditsProvisioned: status === "approved",
      },
    });

    // If approved, move deal to closed_won
    if (status === "approved") {
      await prisma.deal.update({
        where: { id: payment.dealId },
        data: { stage: "closed_won" },
      });
      await prisma.lead.update({
        where: { id: payment.leadId },
        data: { status: "won" },
      });
    }

    return NextResponse.json({ payment: updated });
  } catch (error) {
    console.error("[PAYMENT APPROVE]", error);
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500 }
    );
  }
}
