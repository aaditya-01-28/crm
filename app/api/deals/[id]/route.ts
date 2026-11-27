import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isManagerOrAdmin } from "@/lib/rbac";
import { parseScheduledDateTime, getISTDateString, parseDealDateToTimestamp } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  try {
    const body = await request.json();
    const { stage, closingNotes, quotedPrice, expectedClosingDate, serviceType, quantity } = body;

    return await withClient(async (client) => {
      await client.query("ALTER TABLE deals ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;").catch(() => {});

      const dealRes = await client.query(
        "SELECT id, lead_id, rep_id, stage, closing_notes, quoted_price, expected_closing_date, closed_at, service_type, quantity FROM deals WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (dealRes.rows.length === 0) {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      }

      const deal = dealRes.rows[0];

      // Permissions: Manager/Admin can edit any deal; Executives (sales_rep) can edit their assigned deals
      const isOwner = deal.rep_id === repId;
      if (!isManagerOrAdmin(role) && !isOwner) {
        return NextResponse.json(
          { error: "Forbidden: You can only edit pipeline details for your assigned deals" },
          { status: 403 }
        );
      }

      // Commercial field restriction: only manager/admin can change financial fields
      const isCommercialEdit =
        quotedPrice !== undefined || quantity !== undefined || serviceType !== undefined;
      if (isCommercialEdit && !isManagerOrAdmin(role)) {
        return NextResponse.json(
          { error: "Only managers can edit commercial/financial deal details" },
          { status: 403 }
        );
      }

      const newStage = stage || deal.stage;
      const newPrice = quotedPrice !== undefined ? quotedPrice : deal.quoted_price;
      const wonDetails = body.wonDetails || body || {};
      const explicitWonDate =
        typeof wonDetails?.wonDate === "string" && wonDetails.wonDate.trim()
          ? parseDealDateToTimestamp(wonDetails.wonDate)
          : null;

      let newClosingDate =
        expectedClosingDate && !isNaN(new Date(expectedClosingDate).getTime())
          ? (parseDealDateToTimestamp(expectedClosingDate) || new Date(expectedClosingDate))
          : expectedClosingDate === null || expectedClosingDate === ""
          ? null
          : deal.expected_closing_date;
      if (newStage === "closed_won" && explicitWonDate) {
        newClosingDate = explicitWonDate;
      }

      const newClosedAt =
        newStage === "closed_won"
          ? (explicitWonDate || deal.closed_at || new Date())
          : null;

      const newService = serviceType !== undefined ? serviceType : deal.service_type;
      const newQuantity = quantity !== undefined ? quantity : deal.quantity;
      let newNotes = closingNotes !== undefined ? closingNotes : deal.closing_notes;

      let existingDossier: Record<string, any> = {};
      try {
        if (deal.closing_notes) {
          const parsed = JSON.parse(deal.closing_notes);
          if (typeof parsed === "object" && parsed !== null) {
            existingDossier = parsed;
          }
        }
      } catch {}

      if (newStage === "closed_won" || wonDetails?.userId || wonDetails?.panelUserId) {
        const dossier = {
          ...existingDossier,
          executiveName: wonDetails.executiveName || existingDossier.executiveName || null,
          executiveEmail: wonDetails.executiveEmail || existingDossier.executiveEmail || null,
          wonDate: wonDetails.wonDate || existingDossier.wonDate || getISTDateString(),
          productName: wonDetails.productName || existingDossier.productName || newService,
          productDescription: wonDetails.productDescription ?? existingDossier.productDescription ?? null,
          customerCompanyName: wonDetails.customerCompanyName || body.companyName || existingDossier.customerCompanyName || null,
          customerName: wonDetails.customerName || body.contactName || existingDossier.customerName || null,
          customerContactNumber: wonDetails.customerContactNumber || body.phoneNumber || existingDossier.customerContactNumber || null,
          customerEmail: wonDetails.customerEmail || existingDossier.customerEmail || null,
          userType: wonDetails.userType || existingDossier.userType || "new_user",
          userId: wonDetails.userId || wonDetails.panelUserId || existingDossier.userId || null,
          creditsToAdd: wonDetails.creditsToAdd || newQuantity,
          originalAmount: wonDetails.originalAmount || newPrice,
          taxAmount: wonDetails.taxAmount ?? existingDossier.taxAmount ?? null,
          tds: wonDetails.tds ?? existingDossier.tds ?? "0",
          finalAmount: wonDetails.finalAmount || newPrice,
          paymentMode: wonDetails.paymentMode || existingDossier.paymentMode || null,
          gstinNumber: wonDetails.gstinNumber || wonDetails.gstin || existingDossier.gstinNumber || null,
          paymentScreenshotUrl: wonDetails.paymentScreenshotUrl || wonDetails.screenshotUrl || existingDossier.paymentScreenshotUrl || null,
          notes: closingNotes || existingDossier.notes || null,
        };
        newNotes = JSON.stringify(dossier);
      } else if (newStage === "demo_scheduled" && (body.demoDate || body.meetingLink || body.decisionMakerName || closingNotes !== undefined)) {
        newNotes = JSON.stringify({
          ...existingDossier,
          demoDate: body.demoDate ?? existingDossier.demoDate ?? null,
          meetingLink: body.meetingLink ?? existingDossier.meetingLink ?? null,
          decisionMakerName: body.decisionMakerName ?? existingDossier.decisionMakerName ?? null,
          notes: closingNotes ?? body.demoNotes ?? existingDossier.notes ?? null,
        });
      } else if ((newStage === "demo_done" || newStage === "quote_sent") && (body.contactBackDate || body.followupChannel || closingNotes !== undefined)) {
        newNotes = JSON.stringify({
          ...existingDossier,
          contactBackDate: body.contactBackDate ?? existingDossier.contactBackDate ?? null,
          followupChannel: body.followupChannel ?? existingDossier.followupChannel ?? null,
          notes: closingNotes ?? body.demoFeedback ?? existingDossier.notes ?? null,
        });
      } else if (newStage === "payment_pending" && (body.paymentMode || body.paymentDueDate || closingNotes !== undefined)) {
        newNotes = JSON.stringify({
          ...existingDossier,
          paymentMode: body.paymentMode ?? existingDossier.paymentMode ?? null,
          paymentDueDate: body.paymentDueDate ?? existingDossier.paymentDueDate ?? null,
          notes: closingNotes ?? existingDossier.notes ?? null,
        });
      } else if (newStage === "closed_lost" && (body.lostReason || body.competitorName || body.lostRemarks || body.recontactDate || closingNotes !== undefined)) {
        newNotes = JSON.stringify({
          ...existingDossier,
          lostReason: body.lostReason ?? existingDossier.lostReason ?? null,
          competitorName: body.competitorName ?? existingDossier.competitorName ?? null,
          recontactDate: body.recontactDate ?? existingDossier.recontactDate ?? null,
          lostRemarks: body.lostRemarks ?? existingDossier.lostRemarks ?? null,
          notes: closingNotes ?? body.lostRemarks ?? existingDossier.notes ?? null,
        });
      }

      const updateRes = await client.query(
        `UPDATE deals
         SET stage = $1, closing_notes = $2, quoted_price = $3, expected_closing_date = $4,
             closed_at = $5,
             created_at = COALESCE($6, created_at),
             service_type = $7, quantity = $8, updated_at = NOW()
         WHERE id = $9
         RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                   service_type as "serviceType", quantity, quoted_price as "quotedPrice",
                   expected_closing_date as "expectedClosingDate", closed_at as "closedAt", stage, closing_notes as "closingNotes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [newStage, newNotes, newPrice, newClosingDate, newClosedAt, explicitWonDate, newService, newQuantity, id]
      );

      const updated = updateRes.rows[0];

      // Update lead metadata/contact/company if edited
      const customerEmail = wonDetails?.customerEmail || body.customerEmail || null;
      if (deal.lead_id && (body.contactName || body.companyName || body.serviceType || body.address || customerEmail)) {
        const leadRes = await client.query(
          "SELECT id, custom_metadata FROM leads WHERE id = $1 AND tenant_id = $2",
          [deal.lead_id, tenantId]
        );
        if (leadRes.rows.length > 0) {
          const oldMeta = (leadRes.rows[0].custom_metadata as Record<string, any>) || {};
          const updatedMeta = {
            ...oldMeta,
            ...(body.address ? { address: body.address } : {}),
            ...(customerEmail ? { customerEmail } : {}),
          };
          await client.query(
            `UPDATE leads
             SET contact_name = COALESCE($1, contact_name),
                 company_name = COALESCE($2, company_name),
                 service_type = COALESCE($3, service_type),
                 custom_metadata = $4::jsonb,
                 updated_at = NOW()
             WHERE id = $5`,
            [
              body.contactName || null,
              body.companyName || null,
              body.serviceType || null,
              JSON.stringify(updatedMeta),
              deal.lead_id,
            ]
          );
        }
      }

      // Update lead status according to deal stage
      if (stage === "closed_won" && deal.lead_id) {
        await client.query("UPDATE leads SET status = 'won', updated_at = NOW() WHERE id = $1", [
          deal.lead_id,
        ]);
      } else if (stage === "closed_lost" && deal.lead_id) {
        await client.query("UPDATE leads SET status = 'lost', updated_at = NOW() WHERE id = $1", [
          deal.lead_id,
        ]);
      } else if (stage === "demo_done" && deal.lead_id) {
        await client.query("UPDATE leads SET status = 'demo_done', updated_at = NOW() WHERE id = $1", [
          deal.lead_id,
        ]);
        await client.query(
          "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND task_type = 'product_demo' AND status = 'pending'",
          [deal.lead_id]
        );
      } else if (stage === "demo_scheduled" && deal.lead_id) {
        await client.query(
          "UPDATE leads SET status = 'demo_scheduled', updated_at = NOW() WHERE id = $1",
          [deal.lead_id]
        );
      } else if ((stage === "quote_sent" || stage === "payment_pending") && deal.lead_id) {
        await client.query(
          "UPDATE leads SET status = 'deal_created', updated_at = NOW() WHERE id = $1",
          [deal.lead_id]
        );
      }

      if (deal.lead_id && Array.isArray(body.additionalCommercials) && body.additionalCommercials.length > 0) {
        for (const item of body.additionalCommercials) {
          if (item.serviceType && item.quantity && item.quotedPrice !== undefined) {
            const addClosingDate =
              item.expectedClosingDate && !isNaN(new Date(item.expectedClosingDate).getTime())
                ? new Date(item.expectedClosingDate)
                : null;
            await client.query(
              `INSERT INTO deals (
                 tenant_id, lead_id, rep_id, service_type, quantity, quoted_price,
                 expected_closing_date, stage, closing_notes, created_at, updated_at
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
              [
                tenantId,
                deal.lead_id,
                deal.rep_id || session?.sub || repId,
                item.serviceType,
                parseInt(item.quantity) || 0,
                parseFloat(item.quotedPrice) || 0,
                addClosingDate,
                item.stage || "quote_sent",
                item.closingNotes || null,
              ]
            );
          }
        }
      }

      // Closed Won payment dossier record (upsert payment to keep in sync)
      // Note: "payments" table does NOT have an updated_at column in database schema.
      if (newStage === "closed_won" && deal.lead_id) {
        const portalUserId =
          wonDetails.userId ||
          wonDetails.panelUserId ||
          `TXT_${deal.lead_id.slice(0, 6).toUpperCase()}`;

        let paymentRepId = deal.rep_id || session?.sub || (repId && repId.trim() ? repId : null);
        if (!paymentRepId) {
          const userRes = await client.query(
            "SELECT id FROM users WHERE tenant_id = $1 LIMIT 1",
            [tenantId]
          );
          paymentRepId = userRes.rows[0]?.id || null;
        }

        const existingPay = await client.query(
          "SELECT id FROM payments WHERE deal_id = $1 AND tenant_id = $2 LIMIT 1",
          [id, tenantId]
        );

        if (existingPay.rows.length > 0) {
          await client.query(
            `UPDATE payments
             SET user_type = $1, panel_user_id = $2, credits_to_add = $3,
                 original_amount = $4, tax_amount = $5, tds_amount = $6, final_amount = $7,
                 payment_mode = $8, gstin = $9, screenshot_url = $10,
                 created_at = COALESCE($11, created_at)
             WHERE id = $12`,
            [
              wonDetails.userType || "new_user",
              portalUserId,
              parseInt(wonDetails.creditsToAdd || newQuantity) || 0,
              parseFloat(wonDetails.originalAmount || newPrice) || 0,
              parseFloat(wonDetails.taxAmount || 0) || 0,
              parseFloat(wonDetails.tds || 0) || 0,
              parseFloat(wonDetails.finalAmount || newPrice) || 0,
              wonDetails.paymentMode || "UPI / QR",
              wonDetails.gstinNumber || wonDetails.gstin || null,
              wonDetails.paymentScreenshotUrl || wonDetails.screenshotUrl || "NA",
              explicitWonDate,
              existingPay.rows[0].id,
            ]
          );
        } else if (paymentRepId) {
          await client.query(
            `INSERT INTO payments (
               tenant_id, deal_id, lead_id, rep_id, user_type, panel_user_id,
               credits_to_add, original_amount, tax_amount, tds_amount, final_amount,
               payment_mode, gstin, screenshot_url, ops_approval_status, credits_provisioned, created_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending_verification', false, $15)`,
            [
              tenantId,
              id,
              deal.lead_id,
              paymentRepId,
              wonDetails.userType || "new_user",
              portalUserId,
              parseInt(wonDetails.creditsToAdd || newQuantity) || 0,
              parseFloat(wonDetails.originalAmount || newPrice) || 0,
              parseFloat(wonDetails.taxAmount || 0) || 0,
              parseFloat(wonDetails.tds || 0) || 0,
              parseFloat(wonDetails.finalAmount || newPrice) || 0,
              wonDetails.paymentMode || "UPI / QR",
              wonDetails.gstinNumber || wonDetails.gstin || null,
              wonDetails.paymentScreenshotUrl || wonDetails.screenshotUrl || "NA",
              newClosedAt || new Date(),
            ]
          );
        }
      }

      await client.query("ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS task_source TEXT DEFAULT 'dialer';").catch(() => {});

      // Demo Scheduled calendar task (tagged as pipeline so it doesn't pollute follow-up agenda)
      if (newStage === "demo_scheduled" && body.demoDate && deal.lead_id) {
        const demoDateObj = parseScheduledDateTime(body.demoDate);
        if (demoDateObj && !isNaN(demoDateObj.getTime())) {
          const existingTaskRes = await client.query(
            "SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND task_type = 'product_demo' AND status = 'pending' ORDER BY scheduled_time DESC LIMIT 1",
            [deal.lead_id]
          );

          if (existingTaskRes.rows.length > 0) {
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = $1, meeting_link = COALESCE($2, meeting_link), notes = COALESCE($3, notes), updated_at = NOW()
               WHERE id = $4`,
              [demoDateObj, body.meetingLink || null, body.demoNotes || newNotes || null, existingTaskRes.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO scheduled_tasks (
                 tenant_id, lead_id, rep_id, task_type, scheduled_time, meeting_link, notes, status, task_source, created_at, updated_at
               )
               VALUES ($1, $2, $3, 'product_demo', $4, $5, $6, 'pending', 'pipeline', NOW(), NOW())`,
              [
                tenantId,
                deal.lead_id,
                session?.sub || repId,
                demoDateObj,
                body.meetingLink || null,
                body.demoNotes || newNotes || null,
              ]
            );
          }
        }
      }

      // Demo Done & Quote Sent contact back callback task
      if ((newStage === "demo_done" || newStage === "quote_sent") && body.contactBackDate && deal.lead_id) {
        const cbDateObj = parseScheduledDateTime(body.contactBackDate);
        if (cbDateObj && !isNaN(cbDateObj.getTime())) {
          await client.query(
            `INSERT INTO scheduled_tasks (
               tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at
             )
             VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', 'pipeline', NOW(), NOW())`,
            [
              tenantId,
              deal.lead_id,
              session?.sub || repId,
              cbDateObj,
              newNotes ||
                (newStage === "demo_done"
                  ? "Post-demo update follow-up"
                  : "Quotation update follow-up"),
            ]
          );
        }
      }

      // Closed Lost recontact callback task
      if (newStage === "closed_lost" && body.recontactDate && deal.lead_id) {
        const rcDateObj = parseScheduledDateTime(body.recontactDate);
        if (rcDateObj && !isNaN(rcDateObj.getTime())) {
          await client.query(
            `INSERT INTO scheduled_tasks (
               tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at
             )
             VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', 'pipeline', NOW(), NOW())`,
            [
              tenantId,
              deal.lead_id,
              session?.sub || repId,
              rcDateObj,
              body.lostRemarks
                ? `Closed Lost Re-contact: ${body.lostRemarks}`
                : "Closed Lost re-contact follow-up",
            ]
          );
        }
      }

      const triggerPaymentModal =
        (newStage === "payment_pending" || newStage === "closed_won") && !wonDetails?.userId;
      return NextResponse.json({ deal: updated, triggerPaymentModal });
    });
  } catch (error: any) {
    console.error("[DEALS PATCH]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update deal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const role = session.role;

  if (!isManagerOrAdmin(role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 2 (Sales Manager) and Level 3 (Super Admin) can delete deals from the pipeline" },
      { status: 403 }
    );
  }

  try {
    return await withClient(async (client) => {
      const dealRes = await client.query(
        "SELECT id, lead_id, stage FROM deals WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );
      if (dealRes.rows.length === 0) {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      }

      const deal = dealRes.rows[0];

      // Delete payments and scheduled tasks referencing this deal
      await client.query("DELETE FROM payments WHERE deal_id = $1", [id]);
      await client.query("DELETE FROM deals WHERE id = $1", [id]);

      // Check if any deals remain for this lead
      const remainingDealsRes = await client.query(
        "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2",
        [deal.lead_id, tenantId]
      );

      // If no deals remain for this lead, reset the lead status so it doesn't resurrect deals or remain 'won'
      if (remainingDealsRes.rows.length === 0) {
        await client.query(
          "UPDATE leads SET status = 'contact_in_future', updated_at = NOW() WHERE id = $1 AND status IN ('won', 'closed_won', 'lost', 'closed_lost', 'deal_created')",
          [deal.lead_id]
        );
      }

      return NextResponse.json({ success: true, message: "Deal deleted successfully" });
    });
  } catch (error) {
    console.error("[DEALS DELETE]", error);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
