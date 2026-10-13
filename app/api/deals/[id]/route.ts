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

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { stage, closingNotes, quotedPrice, expectedClosingDate } = body;

    return await withClient(async (client) => {
      const dealRes = await client.query(
        "SELECT id, lead_id, stage, closing_notes, quoted_price, expected_closing_date FROM deals WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (dealRes.rows.length === 0) {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      }

      const deal = dealRes.rows[0];
      const newStage = stage || deal.stage;
      const newNotes = closingNotes !== undefined ? closingNotes : deal.closing_notes;
      const newPrice = quotedPrice !== undefined ? quotedPrice : deal.quoted_price;
      const newClosingDate = expectedClosingDate
        ? new Date(expectedClosingDate)
        : deal.expected_closing_date;

      const updateRes = await client.query(
        `UPDATE deals
         SET stage = $1, closing_notes = $2, quoted_price = $3, expected_closing_date = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                   service_type as "serviceType", quantity, quoted_price as "quotedPrice",
                   expected_closing_date as "expectedClosingDate", stage, closing_notes as "closingNotes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [newStage, newNotes, newPrice, newClosingDate, id]
      );

      const updated = updateRes.rows[0];

      // Update lead status according to deal stage
      if (stage === "closed_won") {
        await client.query("UPDATE leads SET status = 'won', updated_at = NOW() WHERE id = $1", [
          deal.lead_id,
        ]);
      } else if (stage === "closed_lost") {
        await client.query("UPDATE leads SET status = 'lost', updated_at = NOW() WHERE id = $1", [
          deal.lead_id,
        ]);
      } else if (stage === "demo_done") {
        await client.query("UPDATE leads SET status = 'demo_done', updated_at = NOW() WHERE id = $1", [
          deal.lead_id,
        ]);
        await client.query(
          "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND task_type = 'product_demo' AND status = 'pending'",
          [deal.lead_id]
        );
      } else if (stage === "demo_scheduled") {
        await client.query(
          "UPDATE leads SET status = 'demo_scheduled', updated_at = NOW() WHERE id = $1",
          [deal.lead_id]
        );
      } else if (stage === "quote_sent" || stage === "payment_pending") {
        await client.query(
          "UPDATE leads SET status = 'deal_created', updated_at = NOW() WHERE id = $1",
          [deal.lead_id]
        );
      }

      const triggerPaymentModal = stage === "payment_pending" || stage === "closed_won";
      return NextResponse.json({ deal: updated, triggerPaymentModal });
    });
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
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  if (!["super_admin", "sales_manager"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return await withClient(async (client) => {
      const dealRes = await client.query(
        "SELECT id FROM deals WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );
      if (dealRes.rows.length === 0) {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      }

      await client.query("DELETE FROM deals WHERE id = $1", [id]);
      return NextResponse.json({ success: true });
    });
  } catch (error) {
    console.error("[DEALS DELETE]", error);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
