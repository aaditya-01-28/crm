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
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { stage, closingNotes, quotedPrice, expectedClosingDate, serviceType, quantity } = body;

    return await withClient(async (client) => {
      const dealRes = await client.query(
        "SELECT id, lead_id, stage, closing_notes, quoted_price, expected_closing_date, service_type, quantity FROM deals WHERE id = $1 AND tenant_id = $2",
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
      const newService = serviceType !== undefined ? serviceType : deal.service_type;
      const newQuantity = quantity !== undefined ? quantity : deal.quantity;

      const updateRes = await client.query(
        `UPDATE deals
         SET stage = $1, closing_notes = $2, quoted_price = $3, expected_closing_date = $4,
             service_type = $5, quantity = $6, updated_at = NOW()
         WHERE id = $7
         RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                   service_type as "serviceType", quantity, quoted_price as "quotedPrice",
                   expected_closing_date as "expectedClosingDate", stage, closing_notes as "closingNotes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [newStage, newNotes, newPrice, newClosingDate, newService, newQuantity, id]
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

      if (Array.isArray(body.additionalCommercials) && body.additionalCommercials.length > 0) {
        for (const item of body.additionalCommercials) {
          if (item.serviceType && item.quantity && item.quotedPrice !== undefined) {
            await client.query(
              `INSERT INTO deals (
                 tenant_id, lead_id, rep_id, service_type, quantity, quoted_price,
                 expected_closing_date, stage, closing_notes, created_at, updated_at
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
              [
                tenantId,
                deal.lead_id,
                session?.sub || repId,
                item.serviceType,
                parseInt(item.quantity) || 0,
                parseFloat(item.quotedPrice) || 0,
                item.expectedClosingDate ? new Date(item.expectedClosingDate) : null,
                item.stage || "quote_sent",
                item.closingNotes || null,
              ]
            );
          }
        }
      }

      const wonDetails = body.wonDetails || body;

      // Closed Won payment dossier record
      if (newStage === "closed_won" && (wonDetails.userId || wonDetails.panelUserId)) {
        await client.query(
          `INSERT INTO payments (
             tenant_id, deal_id, lead_id, rep_id, user_type, panel_user_id,
             credits_to_add, original_amount, tax_amount, tds_amount, final_amount,
             payment_mode, gstin, screenshot_url, ops_approval_status, credits_provisioned, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending_verification', false, NOW())`,
          [
            tenantId,
            id,
            deal.lead_id,
            session?.sub || repId,
            wonDetails.userType || "new_user",
            wonDetails.userId || wonDetails.panelUserId || "PORTAL_USER",
            parseInt(wonDetails.creditsToAdd || newQuantity) || 0,
            parseFloat(wonDetails.originalAmount || newPrice) || 0,
            parseFloat(wonDetails.taxAmount || 0) || 0,
            parseFloat(wonDetails.tds || 0) || 0,
            parseFloat(wonDetails.finalAmount || newPrice) || 0,
            wonDetails.paymentMode || "Bank Transfer",
            wonDetails.gstinNumber || null,
            wonDetails.paymentScreenshotUrl || "https://placeholder-payment-ref",
          ]
        );
      }

      // Demo Scheduled calendar task
      if (newStage === "demo_scheduled" && body.demoDate) {
        await client.query(
          `INSERT INTO scheduled_tasks (
             tenant_id, lead_id, rep_id, task_type, scheduled_time, meeting_link, notes, status, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'product_demo', $4, $5, $6, 'pending', NOW(), NOW())`,
          [
            tenantId,
            deal.lead_id,
            session?.sub || repId,
            new Date(body.demoDate),
            body.meetingLink || null,
            body.demoNotes || newNotes || null,
          ]
        );
      }

      // Demo Done & Quote Sent contact back callback task
      if ((newStage === "demo_done" || newStage === "quote_sent") && body.contactBackDate) {
        await client.query(
          `INSERT INTO scheduled_tasks (
             tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', NOW(), NOW())`,
          [
            tenantId,
            deal.lead_id,
            session?.sub || repId,
            new Date(body.contactBackDate),
            newNotes ||
              (newStage === "demo_done"
                ? "Post-demo update follow-up"
                : "Quotation update follow-up"),
          ]
        );
      }

      // Closed Lost recontact callback task
      if (newStage === "closed_lost" && body.recontactDate) {
        await client.query(
          `INSERT INTO scheduled_tasks (
             tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', NOW(), NOW())`,
          [
            tenantId,
            deal.lead_id,
            session?.sub || repId,
            new Date(body.recontactDate),
            body.lostRemarks
              ? `Closed Lost Re-contact: ${body.lostRemarks}`
              : "Closed Lost re-contact follow-up",
          ]
        );
      }

      const triggerPaymentModal = (newStage === "payment_pending" || newStage === "closed_won") && !wonDetails.userId;
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
