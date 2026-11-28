import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isAdmin, isManagerOrAdmin } from "@/lib/rbac";
import { isValidUuid, sanitizeExternalUrl } from "@/lib/security";
import { parseScheduledDateTime, getISTDateString, parseDealDateToTimestamp } from "@/lib/utils";
import { ensureDealSplitsTable, syncDealSplits } from "@/lib/deal-splits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  try {
    const body = await request.json();
    const { stage, closingNotes, quotedPrice, expectedClosingDate, serviceType, quantity } = body;

    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await ensureDealSplitsTable(client);

        const dealRes = await client.query(
          "SELECT id, lead_id, rep_id, stage, closing_notes, quoted_price, expected_closing_date, closed_at, service_type, quantity FROM deals WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
          [id, tenantId]
        );

        if (dealRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Deal not found" }, { status: 404 });
        }

        const deal = dealRes.rows[0];

        // Permissions: Manager/Admin can edit any deal; Executives (sales_rep) can edit their assigned deals
        const isOwner = deal.rep_id === repId;
        if (!isManagerOrAdmin(role) && !isOwner) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Forbidden: You can only edit pipeline details for your assigned deals" },
            { status: 403 }
          );
        }

        const existingPay = await client.query(
          "SELECT id, ops_approval_status FROM payments WHERE deal_id = $1 AND tenant_id = $2 LIMIT 1",
          [id, tenantId]
        );
        const isApprovedPayment = existingPay.rows[0]?.ops_approval_status === "approved";

        // Commercial & financial field restriction
        const wonDetails = body.wonDetails || body || {};
        const isFinancialPayload =
          quotedPrice !== undefined ||
          quantity !== undefined ||
          serviceType !== undefined ||
          body.wonDetails !== undefined ||
          body.splitConfig !== undefined ||
          body.additionalCommercials !== undefined;

        if (isApprovedPayment && isFinancialPayload && !isAdmin(role)) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Forbidden: Approved payment records and splits are locked." },
            { status: 403 }
          );
        }

        const isCommercialEdit =
          quotedPrice !== undefined ||
          quantity !== undefined ||
          serviceType !== undefined ||
          (existingPay.rows.length > 0 &&
            (body.wonDetails !== undefined || body.splitConfig !== undefined));
        if (isCommercialEdit && !isManagerOrAdmin(role)) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Forbidden: Only managers can edit commercial/financial or submitted payment details" },
            { status: 403 }
          );
        }

      const newStage = stage || deal.stage;
      const newPrice = quotedPrice !== undefined ? Math.max(0, Number(quotedPrice) || 0) : deal.quoted_price;
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
          paymentScreenshotUrl: sanitizeExternalUrl(wonDetails.paymentScreenshotUrl || wonDetails.screenshotUrl, { allowRelative: true }) || existingDossier.paymentScreenshotUrl || null,
          notes: closingNotes || existingDossier.notes || null,
        };
        newNotes = JSON.stringify(dossier);
      } else if (newStage === "demo_scheduled" && (body.demoDate || body.meetingLink || body.decisionMakerName || closingNotes !== undefined)) {
        newNotes = JSON.stringify({
          ...existingDossier,
          demoDate: body.demoDate ?? existingDossier.demoDate ?? null,
          meetingLink: sanitizeExternalUrl(body.meetingLink) ?? existingDossier.meetingLink ?? null,
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
         WHERE id = $9 AND tenant_id = $10
         RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                   service_type as "serviceType", quantity, quoted_price as "quotedPrice",
                   expected_closing_date as "expectedClosingDate", closed_at as "closedAt", stage, closing_notes as "closingNotes",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [newStage, newNotes, newPrice, newClosingDate, newClosedAt, explicitWonDate, newService, newQuantity, id, tenantId]
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
             WHERE id = $5 AND tenant_id = $6`,
            [
              body.contactName || null,
              body.companyName || null,
              body.serviceType || null,
              JSON.stringify(updatedMeta),
              deal.lead_id,
              tenantId,
            ]
          );
        }
      }

      // Update lead status according to deal stage
      if (stage === "closed_won" && deal.lead_id) {
        await client.query("UPDATE leads SET status = 'won', updated_at = NOW() WHERE id = $1 AND tenant_id = $2", [
          deal.lead_id,
          tenantId,
        ]);
      } else if (stage === "closed_lost" && deal.lead_id) {
        await client.query("UPDATE leads SET status = 'lost', updated_at = NOW() WHERE id = $1 AND tenant_id = $2", [
          deal.lead_id,
          tenantId,
        ]);
      } else if (stage === "demo_done" && deal.lead_id) {
        await client.query("UPDATE leads SET status = 'demo_done', updated_at = NOW() WHERE id = $1 AND tenant_id = $2", [
          deal.lead_id,
          tenantId,
        ]);
        await client.query(
          "UPDATE scheduled_tasks SET status = 'completed', updated_at = NOW() WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'pending'",
          [deal.lead_id, tenantId]
        );
      } else if (stage === "demo_scheduled" && deal.lead_id) {
        await client.query(
          "UPDATE leads SET status = 'demo_scheduled', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
          [deal.lead_id, tenantId]
        );
      } else if ((stage === "quote_sent" || stage === "payment_pending") && deal.lead_id) {
        await client.query(
          "UPDATE leads SET status = 'deal_created', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
          [deal.lead_id, tenantId]
        );
      }

      if (deal.lead_id && Array.isArray(body.additionalCommercials) && body.additionalCommercials.length > 0) {
        if (!isManagerOrAdmin(role)) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Forbidden: Only managers can add additional commercials" },
            { status: 403 }
          );
        }
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
                Math.max(0, parseInt(item.quantity) || 0),
                Math.max(0, parseFloat(item.quotedPrice) || 0),
                addClosingDate,
                item.stage || "quote_sent",
                item.closingNotes || null,
              ]
            );
          }
        }
      }

      // Closed Won payment dossier record (upsert payment to keep in sync; never mutate already-approved payment records here)
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

        const safeScreenshot =
          sanitizeExternalUrl(wonDetails.paymentScreenshotUrl || wonDetails.screenshotUrl, { allowRelative: true }) || "NA";

        if (existingPay.rows.length > 0 && !isApprovedPayment) {
          await client.query(
            `UPDATE payments
             SET user_type = $1, panel_user_id = $2, credits_to_add = $3,
                 original_amount = $4, tax_amount = $5, tds_amount = $6, final_amount = $7,
                 payment_mode = $8, gstin = $9, screenshot_url = $10,
                 created_at = COALESCE($11, created_at)
             WHERE id = $12 AND tenant_id = $13`,
            [
              wonDetails.userType || "new_user",
              portalUserId,
              Math.max(0, parseInt(wonDetails.creditsToAdd || newQuantity) || 0),
              Math.max(0, parseFloat(wonDetails.originalAmount || newPrice) || 0),
              Math.max(0, parseFloat(wonDetails.taxAmount || 0) || 0),
              Math.max(0, parseFloat(wonDetails.tds || 0) || 0),
              Math.max(0, parseFloat(wonDetails.finalAmount || newPrice) || 0),
              wonDetails.paymentMode || "UPI / QR",
              wonDetails.gstinNumber || wonDetails.gstin || null,
              safeScreenshot,
              explicitWonDate,
              existingPay.rows[0].id,
              tenantId,
            ]
          );
        } else if (existingPay.rows.length === 0 && paymentRepId) {
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
              Math.max(0, parseInt(wonDetails.creditsToAdd || newQuantity) || 0),
              Math.max(0, parseFloat(wonDetails.originalAmount || newPrice) || 0),
              Math.max(0, parseFloat(wonDetails.taxAmount || 0) || 0),
              Math.max(0, parseFloat(wonDetails.tds || 0) || 0),
              Math.max(0, parseFloat(wonDetails.finalAmount || newPrice) || 0),
              wonDetails.paymentMode || "UPI / QR",
              wonDetails.gstinNumber || wonDetails.gstin || null,
              safeScreenshot,
              newClosedAt || new Date(),
            ]
          );
        }

        if (body.splitConfig !== undefined && !isApprovedPayment) {
          const currentOpsStatus =
            existingPay.rows[0]?.ops_approval_status || "pending_verification";
          await syncDealSplits({
            client,
            tenantId,
            dealId: id,
            fallbackPrimaryRepId: deal.rep_id || repId,
            splitConfig: body.splitConfig,
            status: currentOpsStatus === "approved" ? "approved" : "pending_verification",
          });
        }
      } else if (body.splitConfig && !body.splitConfig.enabled && !isApprovedPayment) {
        await syncDealSplits({
          client,
          tenantId,
          dealId: id,
          fallbackPrimaryRepId: deal.rep_id || repId,
          splitConfig: { enabled: false },
          status: "pending_verification",
        });
      }

      // Demo Scheduled calendar task (tagged as pipeline so it doesn't pollute follow-up agenda)
      if (newStage === "demo_scheduled" && body.demoDate && deal.lead_id) {
        const demoDateObj = parseScheduledDateTime(body.demoDate);
        if (demoDateObj && !isNaN(demoDateObj.getTime())) {
          const safeDemoLink = sanitizeExternalUrl(body.meetingLink);
          const existingTaskRes = await client.query(
            "SELECT id FROM scheduled_tasks WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'product_demo' AND status = 'pending' ORDER BY scheduled_time DESC LIMIT 1",
            [deal.lead_id, tenantId]
          );

          if (existingTaskRes.rows.length > 0) {
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = $1, meeting_link = COALESCE($2, meeting_link), notes = COALESCE($3, notes), updated_at = NOW()
               WHERE id = $4 AND tenant_id = $5`,
              [demoDateObj, safeDemoLink, body.demoNotes || newNotes || null, existingTaskRes.rows[0].id, tenantId]
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
                safeDemoLink,
                body.demoNotes || newNotes || null,
              ]
            );
          }
        }
      }

      // Demo Done & Quote Sent contact back callback task (upsert existing pending callback)
      if ((newStage === "demo_done" || newStage === "quote_sent") && body.contactBackDate && deal.lead_id) {
        const cbDateObj = parseScheduledDateTime(body.contactBackDate);
        if (cbDateObj && !isNaN(cbDateObj.getTime())) {
          const readableCbNote =
            (typeof closingNotes === "string" && closingNotes.trim()) ||
            (typeof body.demoFeedback === "string" && body.demoFeedback.trim()) ||
            (newStage === "demo_done" ? "Post-demo update follow-up" : "Quotation update follow-up");
          const taskRepId = deal.rep_id || session?.sub || repId;

          const existingCbRes = await client.query(
            `SELECT id FROM scheduled_tasks
             WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'callback' AND status = 'pending'
             ORDER BY updated_at DESC LIMIT 1`,
            [deal.lead_id, tenantId]
          );

          if (existingCbRes.rows.length > 0) {
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = $1, notes = $2, rep_id = COALESCE($3, rep_id), task_source = 'pipeline', updated_at = NOW()
               WHERE id = $4 AND tenant_id = $5`,
              [cbDateObj, readableCbNote, taskRepId, existingCbRes.rows[0].id, tenantId]
            );
            await client.query(
              `UPDATE scheduled_tasks SET status = 'rescheduled', updated_at = NOW()
               WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'callback' AND status = 'pending' AND id <> $3`,
              [deal.lead_id, tenantId, existingCbRes.rows[0].id]
            ).catch(() => {});
          } else {
            await client.query(
              `INSERT INTO scheduled_tasks (
                 tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at
               )
               VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', 'pipeline', NOW(), NOW())`,
              [tenantId, deal.lead_id, taskRepId, cbDateObj, readableCbNote]
            );
          }
        }
      }

      // Closed Lost recontact callback task (upsert existing pending callback)
      if (newStage === "closed_lost" && body.recontactDate && deal.lead_id) {
        const rcDateObj = parseScheduledDateTime(body.recontactDate);
        if (rcDateObj && !isNaN(rcDateObj.getTime())) {
          const rcNote = body.lostRemarks
            ? `Closed Lost Re-contact: ${body.lostRemarks}`
            : "Closed Lost re-contact follow-up";
          const taskRepId = deal.rep_id || session?.sub || repId;

          const existingCbRes = await client.query(
            `SELECT id FROM scheduled_tasks
             WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'callback' AND status = 'pending'
             ORDER BY updated_at DESC LIMIT 1`,
            [deal.lead_id, tenantId]
          );

          if (existingCbRes.rows.length > 0) {
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = $1, notes = $2, rep_id = COALESCE($3, rep_id), task_source = 'pipeline', updated_at = NOW()
               WHERE id = $4 AND tenant_id = $5`,
              [rcDateObj, rcNote, taskRepId, existingCbRes.rows[0].id, tenantId]
            );
          } else {
            await client.query(
              `INSERT INTO scheduled_tasks (
                 tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at
               )
               VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', 'pipeline', NOW(), NOW())`,
              [tenantId, deal.lead_id, taskRepId, rcDateObj, rcNote]
            );
          }
        }
      }

      await client.query("COMMIT");
      const triggerPaymentModal =
        (newStage === "payment_pending" || newStage === "closed_won") && !wonDetails?.userId;
      return NextResponse.json({ deal: updated, triggerPaymentModal });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error: any) {
    console.error("[DEALS PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update deal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
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
      await client.query("BEGIN");
      try {
        const dealRes = await client.query(
          "SELECT id, lead_id, stage FROM deals WHERE id = $1 AND tenant_id = $2",
          [id, tenantId]
        );
        if (dealRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Deal not found" }, { status: 404 });
        }

        const deal = dealRes.rows[0];
        const approvedPay = await client.query(
          "SELECT id FROM payments WHERE deal_id = $1 AND tenant_id = $2 AND ops_approval_status = 'approved' LIMIT 1",
          [id, tenantId]
        );
        if (approvedPay.rows.length > 0 && !isAdmin(role)) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Forbidden: Only Super Admins can delete deals with approved payments." },
            { status: 403 }
          );
        }

        await client.query("DELETE FROM payments WHERE deal_id = $1 AND tenant_id = $2", [id, tenantId]);
        await client.query("DELETE FROM deal_splits WHERE deal_id = $1 AND tenant_id = $2", [id, tenantId]).catch(() => {});
        await client.query("DELETE FROM deals WHERE id = $1 AND tenant_id = $2", [id, tenantId]);

        // Check if any deals remain for this lead
        const remainingDealsRes = await client.query(
          "SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2",
          [deal.lead_id, tenantId]
        );

        // If no deals remain for this lead, reset the lead status so it doesn't resurrect deals or remain 'won'
        if (remainingDealsRes.rows.length === 0) {
          await client.query(
            "UPDATE leads SET status = 'contact_in_future', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND status IN ('won', 'closed_won', 'lost', 'closed_lost', 'deal_created')",
            [deal.lead_id, tenantId]
          );
        }

        await client.query("COMMIT");
        return NextResponse.json({ success: true, message: "Deal deleted successfully" });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[DEALS DELETE]", error);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
