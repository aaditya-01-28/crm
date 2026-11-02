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
        let matchedDealId = payment.deal_id;

        if (matchedDealId) {
          await client.query("UPDATE deals SET stage = 'closed_won', updated_at = NOW() WHERE id = $1", [
            matchedDealId,
          ]);
        }

        if (payment.lead_id) {
          await client.query("UPDATE leads SET status = 'won', updated_at = NOW() WHERE id = $1", [
            payment.lead_id,
          ]);

          // If payment was not linked to a deal, find or create the deal for this lead
          if (!matchedDealId) {
            const existingDeal = await client.query(
              "SELECT id FROM deals WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1",
              [payment.lead_id]
            );
            if (existingDeal.rows.length > 0) {
              matchedDealId = existingDeal.rows[0].id;
              await client.query("UPDATE deals SET stage = 'closed_won', updated_at = NOW() WHERE id = $1", [matchedDealId]);
              await client.query("UPDATE payments SET deal_id = $1 WHERE id = $2", [matchedDealId, id]);
            } else {
              const newDeal = await client.query(
                `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
                 SELECT p.tenant_id, p.lead_id, COALESCE(p.rep_id, $2), COALESCE(l.service_type, 'WhatsApp API'), COALESCE(p.credits_to_add, 10000), COALESCE(p.original_amount, p.final_amount, 0), 'closed_won', 'Approved Payment Onboarding', NOW(), NOW()
                 FROM payments p
                 LEFT JOIN leads l ON p.lead_id = l.id
                 WHERE p.id = $1
                 RETURNING id`,
                [id, approverId]
              );
              if (newDeal.rows.length > 0) {
                matchedDealId = newDeal.rows[0].id;
                await client.query("UPDATE payments SET deal_id = $1 WHERE id = $2", [matchedDealId, id]);
              }
            }
          }
        }
      }

      return NextResponse.json({ payment: updateRes.rows[0] });
    });
  } catch (error) {
    console.error("[PAYMENT APPROVE]", error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}
