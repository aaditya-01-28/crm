import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isValidUuid } from "@/lib/security";
import { ensureDealSplitsTable } from "@/lib/deal-splits";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const approverId = session.sub;
  const role = session.role;

  if (!can(role, "payments:approve")) {
    return NextResponse.json(
      { error: "Forbidden: Only Operations and Super Admin can approve or reject payments." },
      { status: 403 }
    );
  }

  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { status } = body; // 'approved' | 'rejected'
    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json(
        { error: "Status must be either 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await ensureDealSplitsTable(client);

        const paymentRes = await client.query(
          "SELECT id, deal_id, lead_id, payment_mode, ops_approval_status FROM payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
          [id, tenantId]
        );

        if (paymentRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Payment not found" }, { status: 404 });
        }

        const payment = paymentRes.rows[0];
        if (payment.ops_approval_status === "approved") {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Payment has already been approved and provisioned." },
            { status: 409 }
          );
        }

        const updateRes = await client.query(
          `UPDATE payments
           SET ops_approval_status = $1, approved_by = $2, credits_provisioned = $3
           WHERE id = $4 AND tenant_id = $5
           RETURNING *`,
          [status, approverId, status === "approved", id, tenantId]
        );

        if (status === "approved") {
          let matchedDealId = payment.deal_id;

          if (matchedDealId) {
            const isSheetImport = payment.payment_mode === "Google Sheet Import";
            await client.query(
              isSheetImport
                ? "UPDATE deals SET stage = 'closed_won', closed_at = COALESCE(closed_at, expected_closing_date::timestamptz, created_at, NOW()), updated_at = COALESCE(expected_closing_date::timestamptz, created_at, NOW()) WHERE id = $1 AND tenant_id = $2"
                : "UPDATE deals SET stage = 'closed_won', closed_at = COALESCE(closed_at, expected_closing_date::timestamptz, created_at, NOW()), updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
              [matchedDealId, tenantId]
            );
            await client.query(
              `UPDATE deal_splits SET status = 'approved' WHERE deal_id = $1 AND tenant_id = $2`,
              [matchedDealId, tenantId]
            );
          }

          if (payment.lead_id) {
            await client.query(
              "UPDATE leads SET status = 'won', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
              [payment.lead_id, tenantId]
            );

            // If payment was not linked to a deal, find or create the deal for this lead
            if (!matchedDealId) {
              const existingDeal = await client.query(
                "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
                [payment.lead_id, tenantId]
              );
              if (existingDeal.rows.length > 0) {
                matchedDealId = existingDeal.rows[0].id;
                await client.query(
                  "UPDATE deals SET stage = 'closed_won', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
                  [matchedDealId, tenantId]
                );
                await client.query(
                  "UPDATE payments SET deal_id = $1 WHERE id = $2 AND tenant_id = $3",
                  [matchedDealId, id, tenantId]
                );
              } else {
                const newDeal = await client.query(
                  `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
                   SELECT p.tenant_id, p.lead_id, COALESCE(p.rep_id, $2), COALESCE(l.service_type, 'WhatsApp API'), COALESCE(p.credits_to_add, 0), COALESCE(p.original_amount, p.final_amount, 0), 'closed_won', 'Approved Payment Onboarding', NOW(), NOW()
                   FROM payments p
                   LEFT JOIN leads l ON p.lead_id = l.id AND l.tenant_id = p.tenant_id
                   WHERE p.id = $1 AND p.tenant_id = $3
                   RETURNING id`,
                  [id, approverId, tenantId]
                );
                if (newDeal.rows.length > 0) {
                  matchedDealId = newDeal.rows[0].id;
                  await client.query(
                    "UPDATE payments SET deal_id = $1 WHERE id = $2 AND tenant_id = $3",
                    [matchedDealId, id, tenantId]
                  );
                }
              }
            }
          }
        } else if (status === "rejected" && payment.deal_id) {
          await client.query(
            `UPDATE deal_splits SET status = 'rejected' WHERE deal_id = $1 AND tenant_id = $2`,
            [payment.deal_id, tenantId]
          );
        }

        await client.query("COMMIT");
        return NextResponse.json({ payment: updateRes.rows[0] });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[PAYMENT APPROVE]", error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}
