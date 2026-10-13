import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const approverId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  if (!["super_admin", "accounts_ops", "sales_manager"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { status } = body; // 'approved' | 'rejected'

    return await withClient(async (client) => {
      const paymentRes = await client.query(
        "SELECT id, deal_id, lead_id FROM payments WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (paymentRes.rows.length === 0) {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      }

      const payment = paymentRes.rows[0];

      const updateRes = await client.query(
        `UPDATE payments
         SET ops_approval_status = $1, approved_by = $2, credits_provisioned = $3
         WHERE id = $4
         RETURNING *`,
        [status, approverId, status === "approved", id]
      );

      if (status === "approved") {
        await client.query("UPDATE deals SET stage = 'closed_won', updated_at = NOW() WHERE id = $1", [
          payment.deal_id,
        ]);
        await client.query("UPDATE leads SET status = 'won', updated_at = NOW() WHERE id = $1", [
          payment.lead_id,
        ]);
      }

      return NextResponse.json({ payment: updateRes.rows[0] });
    });
  } catch (error) {
    console.error("[PAYMENT APPROVE]", error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}
