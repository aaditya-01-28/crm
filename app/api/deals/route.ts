import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isSalesRep } from "@/lib/rbac";
import { isValidUuid, sanitizeExternalUrl } from "@/lib/security";
import { parseScheduledDateTime, getISTDateString, parseDealDateToTimestamp } from "@/lib/utils";
import { ensureDealSplitsTable, syncDealSplits } from "@/lib/deal-splits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  const isRep = isSalesRep(role);
  const { searchParams } = new URL(request.url);
  const filterRepId = searchParams.get("repId");

  if (filterRepId && filterRepId !== "all" && !isValidUuid(filterRepId)) {
    return NextResponse.json({ error: "Invalid repId" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      await ensureDealSplitsTable(client);

      let whereClause = "d.tenant_id = $1";
      const params: any[] = [tenantId];

      if (isRep && isValidUuid(repId)) {
        params.push(repId);
        whereClause += ` AND (d.rep_id = $${params.length} OR l.assigned_rep_id = $${params.length} OR EXISTS (SELECT 1 FROM deal_splits ds WHERE ds.deal_id = d.id AND ds.tenant_id = d.tenant_id AND ds.rep_id = $${params.length} AND ds.status = 'approved'))`;
      } else if (!isRep && filterRepId && filterRepId !== "all") {
        params.push(filterRepId);
        whereClause += ` AND (d.rep_id = $${params.length} OR l.assigned_rep_id = $${params.length} OR EXISTS (SELECT 1 FROM deal_splits ds WHERE ds.deal_id = d.id AND ds.tenant_id = d.tenant_id AND ds.rep_id = $${params.length} AND ds.status = 'approved'))`;
      }

      const dealsRes = await client.query(
        `SELECT d.id, d.tenant_id as "tenantId", d.lead_id as "leadId", d.rep_id as "repId",
                d.service_type as "serviceType", d.quantity, d.quoted_price as "quotedPrice",
                d.expected_closing_date as "expectedClosingDate", d.closed_at as "closedAt", d.stage, d.closing_notes as "closingNotes",
                d.created_at as "createdAt", d.updated_at as "updatedAt",
                l.phone_number as "lead_phoneNumber", l.contact_name as "lead_contactName",
                l.company_name as "lead_companyName", l.business_vertical as "lead_businessVertical",
                l.custom_metadata as "lead_customMetadata",
                COALESCE(u.full_name, rep_lead.full_name, 'Assigned Representative') as "rep_fullName",
                COALESCE(u.email, rep_lead.email, '') as "rep_email",
                pay.id as payment_id,
                pay.user_type as "payment_userType",
                pay.panel_user_id as "payment_panelUserId",
                pay.credits_to_add as "payment_creditsToAdd",
                pay.original_amount as "payment_originalAmount",
                pay.tax_amount as "payment_taxAmount",
                pay.tds_amount as "payment_tdsAmount",
                pay.final_amount as "payment_finalAmount",
                pay.payment_mode as "payment_paymentMode",
                pay.gstin as "payment_gstin",
                pay.screenshot_url as "payment_screenshotUrl",
                pay.ops_approval_status as "payment_opsApprovalStatus",
                pay.created_at as "payment_createdAt",
                demo_task.scheduled_time as "demoTask_scheduledTime",
                demo_task.meeting_link as "demoTask_meetingLink",
                demo_task.notes as "demoTask_notes",
                demo_task.status as "demoTask_status",
                demo_task.completed_at as "demoTask_completedAt",
                followup_task.scheduled_time as "followupTask_scheduledTime",
                followup_task.notes as "followupTask_notes",
                sp.splits_json as "splitsJson"
         FROM deals d
         LEFT JOIN leads l ON d.lead_id = l.id AND l.tenant_id = d.tenant_id
         LEFT JOIN users u ON d.rep_id = u.id AND u.tenant_id = d.tenant_id
         LEFT JOIN users rep_lead ON l.assigned_rep_id = rep_lead.id AND rep_lead.tenant_id = d.tenant_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(
             json_agg(
               json_build_object(
                 'repId', ds.rep_id,
                 'repName', su.full_name,
                 'percentage', ds.percentage::float8,
                 'isPrimary', ds.is_primary,
                 'status', ds.status
               )
               ORDER BY ds.is_primary DESC, ds.percentage DESC
             ),
             '[]'::json
           ) as splits_json
           FROM deal_splits ds
           LEFT JOIN users su ON ds.rep_id = su.id AND su.tenant_id = ds.tenant_id
           WHERE ds.deal_id = d.id AND ds.tenant_id = d.tenant_id
         ) sp ON true
         LEFT JOIN LATERAL (
           SELECT st.scheduled_time, st.meeting_link, st.notes, st.status, st.updated_at as completed_at
           FROM scheduled_tasks st
           WHERE st.lead_id = d.lead_id
             AND st.tenant_id = d.tenant_id
             AND st.task_type = 'product_demo'
             AND st.status IN ('pending', 'completed')
           ORDER BY COALESCE(st.scheduled_time, st.updated_at) DESC
           LIMIT 1
         ) demo_task ON true
         LEFT JOIN LATERAL (
           SELECT st.scheduled_time, st.notes
           FROM scheduled_tasks st
           WHERE st.lead_id = d.lead_id
             AND st.tenant_id = d.tenant_id
             AND st.task_type = 'callback'
             AND st.status = 'pending'
           ORDER BY st.scheduled_time ASC NULLS LAST, st.updated_at DESC
           LIMIT 1
         ) followup_task ON true
         LEFT JOIN LATERAL (
           SELECT p.id,
                  p.user_type,
                  p.panel_user_id,
                  p.credits_to_add,
                  p.original_amount,
                  p.tax_amount,
                  p.tds_amount,
                  p.final_amount,
                  p.payment_mode,
                  p.gstin,
                  p.screenshot_url,
                  p.ops_approval_status,
                  p.created_at
           FROM payments p
           WHERE p.deal_id = d.id AND p.tenant_id = d.tenant_id
           ORDER BY p.created_at DESC
           LIMIT 1
         ) pay ON true
         WHERE ${whereClause}
         ORDER BY d.created_at DESC`,
        params
      );

      const deals = dealsRes.rows.map((r) => {
        let normalizedStage = r.stage;
        if (r.payment_opsApprovalStatus === "approved") {
          normalizedStage = "closed_won";
        } else if (normalizedStage === "won") {
          normalizedStage = "closed_won";
        } else if (normalizedStage === "lost") {
          normalizedStage = "closed_lost";
        }

        let customMetadata = r.lead_customMetadata;
        if (typeof customMetadata === "string") {
          try {
            customMetadata = JSON.parse(customMetadata);
          } catch {}
        }

        return {
          id: r.id,
          tenantId: r.tenantId,
          leadId: r.leadId,
          repId: r.repId,
          serviceType: r.serviceType,
          quantity: r.quantity,
          quotedPrice: r.quotedPrice,
          expectedClosingDate: r.expectedClosingDate,
          closedAt: r.closedAt,
          stage: normalizedStage,
          closingNotes: r.closingNotes,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          lead: {
            phoneNumber: r.lead_phoneNumber || "",
            contactName: r.lead_contactName,
            companyName: r.lead_companyName,
            businessVertical: r.lead_businessVertical,
            customMetadata,
          },
          rep: {
            fullName: r.rep_fullName,
            email: r.rep_email,
          },
          payment: r.payment_id
            ? {
                id: r.payment_id,
                userType: r.payment_userType,
                panelUserId: r.payment_panelUserId,
                creditsToAdd: r.payment_creditsToAdd,
                originalAmount: r.payment_originalAmount,
                taxAmount: r.payment_taxAmount,
                tdsAmount: r.payment_tdsAmount,
                finalAmount: r.payment_finalAmount,
                paymentMode: r.payment_paymentMode,
                gstin: r.payment_gstin,
                screenshotUrl: r.payment_screenshotUrl,
                opsApprovalStatus: r.payment_opsApprovalStatus,
                createdAt: r.payment_createdAt,
              }
            : null,
          demoTask:
            r.demoTask_scheduledTime || r.demoTask_completedAt || r.demoTask_meetingLink || r.demoTask_notes
              ? {
                  scheduledTime: r.demoTask_scheduledTime,
                  meetingLink: r.demoTask_meetingLink,
                  notes: r.demoTask_notes,
                  status: r.demoTask_status,
                  completedAt: r.demoTask_completedAt,
                }
              : null,
          followupTask:
            r.followupTask_scheduledTime || r.followupTask_notes
              ? {
                  scheduledTime: r.followupTask_scheduledTime,
                  notes: r.followupTask_notes,
                }
              : null,
          splits: Array.isArray(r.splitsJson) ? r.splitsJson : [],
        };
      });

      return NextResponse.json({ deals });
    });
  } catch (error) {
    console.error("[DEALS GET]", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  try {
    const body = await request.json();
    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await ensureDealSplitsTable(client);
        let leadId = body.leadId;

        if (leadId !== undefined && leadId !== null && !isValidUuid(leadId)) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
        }

        // If leadId is not provided, find or create the lead by phone number
        if (!leadId) {
          if (!body.phoneNumber) {
            await client.query("ROLLBACK");
            return NextResponse.json(
              { error: "Phone number or an existing lead is required" },
              { status: 400 }
            );
          }

          const phone = body.phoneNumber.trim();
          const phoneDigits = phone.replace(/\D/g, "");
          const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;
          // Check if lead already exists with this phone (matching normalized last 10 digits)
          const existingLeadRes = await client.query(
            `SELECT id, assigned_rep_id as "assignedRepId", custom_metadata
             FROM leads
             WHERE tenant_id = $1
               AND (
                 phone_number = $2
                 OR (LENGTH($3) >= 7 AND RIGHT(REGEXP_REPLACE(phone_number, '\\D', '', 'g'), 10) = $3)
               )
             ORDER BY updated_at DESC
             LIMIT 1`,
            [tenantId, phone, phoneSuffix]
          );

          const customerEmail =
            body.customerEmail ||
            body.email ||
            body.commercials?.[0]?.customerEmail ||
            null;
          if (existingLeadRes.rows.length > 0) {
            if (isSalesRep(role) && existingLeadRes.rows[0].assignedRepId && existingLeadRes.rows[0].assignedRepId !== repId) {
              await client.query("ROLLBACK");
              return NextResponse.json(
                { error: "Forbidden: Lead belongs to another representative." },
                { status: 403 }
              );
            }
            leadId = existingLeadRes.rows[0].id;
            const oldMeta = (existingLeadRes.rows[0].custom_metadata as Record<string, any>) || {};
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
                   status = 'deal_created',
                   updated_at = NOW()
               WHERE id = $5 AND tenant_id = $6`,
              [
                body.contactName || null,
                body.companyName || null,
                body.serviceType || null,
                JSON.stringify(updatedMeta),
                leadId,
                tenantId,
              ]
            );
          } else {
            // Create new lead in database
            const newMeta = {
              ...(body.address ? { address: body.address } : {}),
              ...(customerEmail ? { customerEmail } : {}),
            };
            const newLeadRes = await client.query(
              `INSERT INTO leads (
                 tenant_id, assigned_rep_id, first_assigned_rep_id, first_assigned_at,
                 phone_number, contact_name, company_name, service_type,
                 source, status, custom_metadata, created_at, updated_at
               )
               VALUES ($1, $2, $2, NOW(), $3, $4, $5, $6, 'Pipeline Manual Entry', 'deal_created', $7::jsonb, NOW(), NOW())
               RETURNING id`,
              [
                tenantId,
                repId,
                phone,
                body.contactName || null,
                body.companyName || null,
                body.serviceType || null,
                JSON.stringify(newMeta),
              ]
            );
            leadId = newLeadRes.rows[0].id;
          }
        } else {
          // Verify lead belongs to tenant & rep has access
          const existingLeadRes = await client.query(
            `SELECT id, assigned_rep_id as "assignedRepId", custom_metadata FROM leads WHERE id = $1 AND tenant_id = $2`,
            [leadId, tenantId]
          );
          if (existingLeadRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Lead not found" }, { status: 404 });
          }
          if (isSalesRep(role) && existingLeadRes.rows[0].assignedRepId && existingLeadRes.rows[0].assignedRepId !== repId) {
            await client.query("ROLLBACK");
            return NextResponse.json(
              { error: "Forbidden: Lead is assigned to another representative." },
              { status: 403 }
            );
          }
          const customerEmail =
            body.customerEmail ||
            body.email ||
            body.commercials?.[0]?.customerEmail ||
            null;
          const oldMeta = (existingLeadRes.rows[0].custom_metadata as Record<string, any>) || {};
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
                 status = 'deal_created',
                 updated_at = NOW()
             WHERE id = $5 AND tenant_id = $6`,
            [
              body.contactName || null,
              body.companyName || null,
              body.serviceType || null,
              JSON.stringify(updatedMeta),
              leadId,
              tenantId,
            ]
          );
        }

      const commercials = Array.isArray(body.commercials) && body.commercials.length > 0
        ? body.commercials
        : [
            {
              serviceType: body.serviceType,
              quantity: body.quantity,
              quotedPrice: body.quotedPrice,
              expectedClosingDate: body.expectedClosingDate,
              stage: body.stage || "quote_sent",
              closingNotes: body.closingNotes || null,
            },
          ];

      let primaryDeal = null;
      for (const item of commercials) {
        // Build rich metadata string if present
        let closingNotesToStore = item.closingNotes || null;
        if (
          item.stage === "closed_won" ||
          item.userId ||
          item.panelUserId ||
          item.executiveName ||
          item.customerEmail ||
          item.productDescription
        ) {
          const dossier = {
            executiveName: item.executiveName || body.executiveName || null,
            executiveEmail: item.executiveEmail || body.executiveEmail || null,
            wonDate: item.wonDate || body.wonDate || getISTDateString(),
            productName: item.productName || item.serviceType,
            productDescription: item.productDescription || null,
            customerCompanyName: item.customerCompanyName || body.companyName || null,
            customerName: item.customerName || body.contactName || null,
            customerContactNumber: item.customerContactNumber || body.phoneNumber || null,
            customerEmail: item.customerEmail || body.customerEmail || null,
            userType: item.userType || "new_user",
            userId: item.userId || item.panelUserId || null,
            creditsToAdd: item.creditsToAdd || item.quantity || null,
            originalAmount: item.originalAmount || item.quotedPrice || null,
            taxAmount: item.taxAmount || null,
            tds: item.tds || "0",
            finalAmount: item.finalAmount || null,
            paymentMode: item.paymentMode || null,
            gstinNumber: item.gstinNumber || null,
            paymentScreenshotUrl: sanitizeExternalUrl(item.paymentScreenshotUrl, { allowRelative: true }),
            notes: item.closingNotes || item.notes || null,
          };
          closingNotesToStore = JSON.stringify(dossier);
        } else if (item.stage === "demo_scheduled" && (item.demoDate || item.meetingLink || item.decisionMakerName)) {
          closingNotesToStore = JSON.stringify({
            demoDate: item.demoDate,
            meetingLink: sanitizeExternalUrl(item.meetingLink),
            decisionMakerName: item.decisionMakerName,
            notes: item.closingNotes || item.demoNotes || null,
          });
        } else if ((item.stage === "demo_done" || item.stage === "quote_sent") && (item.contactBackDate || item.followupChannel || item.quoteSentDate)) {
          closingNotesToStore = JSON.stringify({
            ...(item.stage === "quote_sent"
              ? { quoteSentDate: item.quoteSentDate || getISTDateString() }
              : {}),
            contactBackDate: item.contactBackDate,
            followupChannel: item.followupChannel,
            notes: item.closingNotes || item.demoFeedback || null,
          });
        } else if (item.stage === "closed_lost" && (item.lostReason || item.competitorName || item.lostRemarks)) {
          closingNotesToStore = JSON.stringify({
            lostReason: item.lostReason,
            competitorName: item.competitorName,
            lostRemarks: item.lostRemarks,
            notes: item.closingNotes || item.lostRemarks || null,
          });
        }

        // Check if an unpriced or placeholder deal already exists for this lead to prevent duplicate cards
        const existingZeroDeal = await client.query(
          `SELECT id FROM deals WHERE lead_id = $1 AND tenant_id = $2 AND quoted_price = 0 LIMIT 1`,
          [leadId, tenantId]
        );

        const itemStage = item.stage || "quote_sent";
        const isClosedWonItem = itemStage === "closed_won";
        const itemWonDateStr = isClosedWonItem
          ? (item.wonDate || body.wonDate || getISTDateString())
          : null;
        const itemWonTs = parseDealDateToTimestamp(itemWonDateStr);
        const itemQuoteSentTs =
          itemStage === "quote_sent"
            ? parseDealDateToTimestamp(item.quoteSentDate || body.quoteSentDate || getISTDateString())
            : null;
        const itemExpectedClosing =
          itemWonTs ||
          (item.expectedClosingDate ? parseDealDateToTimestamp(item.expectedClosingDate) : null);
        const itemClosedAt = isClosedWonItem ? (itemWonTs || new Date()) : null;
        const itemCreatedAt = itemWonTs || itemQuoteSentTs || new Date();

        const parsedQty = Math.max(0, parseInt(item.quantity) || 0);
        const parsedPrice = Math.max(0, parseFloat(item.quotedPrice) || 0);

        let itemRes;
        if (existingZeroDeal.rows.length > 0) {
          itemRes = await client.query(
            `UPDATE deals
             SET rep_id = $1, service_type = $2, quantity = $3, quoted_price = $4,
                 expected_closing_date = $5, closed_at = $6, created_at = COALESCE($7, created_at),
                 stage = $8, closing_notes = $9, updated_at = NOW()
             WHERE id = $10 AND tenant_id = $11
             RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                       service_type as "serviceType", quantity, quoted_price as "quotedPrice",
                       expected_closing_date as "expectedClosingDate", closed_at as "closedAt", stage, closing_notes as "closingNotes",
                       created_at as "createdAt", updated_at as "updatedAt"`,
            [
              repId,
              item.serviceType,
              parsedQty,
              parsedPrice,
              itemExpectedClosing,
              itemClosedAt,
              itemWonTs || itemQuoteSentTs,
              item.stage || "quote_sent",
              closingNotesToStore,
              existingZeroDeal.rows[0].id,
              tenantId,
            ]
          );
        } else {
          itemRes = await client.query(
            `INSERT INTO deals (
               tenant_id, lead_id, rep_id, service_type, quantity, quoted_price,
               expected_closing_date, closed_at, stage, closing_notes, created_at, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
             RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                       service_type as "serviceType", quantity, quoted_price as "quotedPrice",
                       expected_closing_date as "expectedClosingDate", closed_at as "closedAt", stage, closing_notes as "closingNotes",
                       created_at as "createdAt", updated_at as "updatedAt"`,
            [
              tenantId,
              leadId,
              repId,
              item.serviceType,
              parsedQty,
              parsedPrice,
              itemExpectedClosing,
              itemClosedAt,
              item.stage || "quote_sent",
              closingNotesToStore,
              itemCreatedAt,
            ]
          );
        }
        if (!primaryDeal) {
          primaryDeal = itemRes.rows[0];
        }
      }

      // Update lead status based on primary deal stage
      const primaryStage = primaryDeal?.stage || "quote_sent";
      let leadStatus = "deal_created";
      if (primaryStage === "closed_won") leadStatus = "won";
      else if (primaryStage === "closed_lost") leadStatus = "lost";
      else if (primaryStage === "demo_scheduled") leadStatus = "demo_scheduled";
      else if (primaryStage === "demo_done") leadStatus = "demo_done";

      await client.query("UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3", [
        leadStatus,
        leadId,
        tenantId,
      ]);

      const firstComm = commercials[0] || {};
      const wonDetails = body.wonDetails || firstComm;

      // Closed Won payment dossier record
      if (primaryStage === "closed_won") {
        const portalUserId = wonDetails.userId || wonDetails.panelUserId || (leadId ? `TXT_${leadId.slice(0, 6).toUpperCase()}` : "PORTAL_USER");
        const paymentCreatedAt =
          parseDealDateToTimestamp(wonDetails.wonDate || body.wonDate) ||
          primaryDeal?.closedAt ||
          new Date();
        const safePayScreenshot =
          sanitizeExternalUrl(wonDetails.paymentScreenshotUrl || wonDetails.screenshotUrl, { allowRelative: true }) || "NA";
        await client.query(
          `INSERT INTO payments (
             tenant_id, deal_id, lead_id, rep_id, user_type, panel_user_id,
             credits_to_add, original_amount, tax_amount, tds_amount, final_amount,
             payment_mode, gstin, screenshot_url, ops_approval_status, credits_provisioned, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending_verification', false, $15)`,
          [
            tenantId,
            primaryDeal.id,
            leadId,
            repId,
            wonDetails.userType || "new_user",
            portalUserId,
            Math.max(0, parseInt(wonDetails.creditsToAdd || firstComm.quantity) || 0),
            Math.max(0, parseFloat(wonDetails.originalAmount || firstComm.quotedPrice) || 0),
            Math.max(0, parseFloat(wonDetails.taxAmount || 0) || 0),
            Math.max(0, parseFloat(wonDetails.tds || 0) || 0),
            Math.max(0, parseFloat(wonDetails.finalAmount || firstComm.quotedPrice) || 0),
            wonDetails.paymentMode || "Bank Transfer",
            wonDetails.gstinNumber || wonDetails.gstin || null,
            safePayScreenshot,
            paymentCreatedAt,
          ]
        );

        if (body.splitConfig?.enabled && primaryDeal?.id) {
          await syncDealSplits({
            client,
            tenantId,
            dealId: primaryDeal.id,
            fallbackPrimaryRepId: repId,
            splitConfig: body.splitConfig,
            status: "pending_verification",
          });
        }
      }

      // Demo Scheduled calendar task (tagged as pipeline source so it stays in pipeline and doesn't pollute agenda)
      if (primaryStage === "demo_scheduled" && firstComm.demoDate) {
        await client.query(
          `INSERT INTO scheduled_tasks (
             tenant_id, lead_id, rep_id, task_type, scheduled_time, meeting_link, notes, status, task_source, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'product_demo', $4, $5, $6, 'pending', 'pipeline', NOW(), NOW())`,
          [
            tenantId,
            leadId,
            repId,
            parseScheduledDateTime(firstComm.demoDate),
            sanitizeExternalUrl(firstComm.meetingLink),
            firstComm.demoNotes || firstComm.closingNotes || null,
          ]
        );
      }

      // Demo Done & Quote Sent contact back callback task (upsert)
      if (
        (primaryStage === "demo_done" || primaryStage === "quote_sent") &&
        firstComm.contactBackDate
      ) {
        const cbDateObj = parseScheduledDateTime(firstComm.contactBackDate);
        if (cbDateObj && !isNaN(cbDateObj.getTime())) {
          const cbNote =
            firstComm.closingNotes ||
            (primaryStage === "demo_done"
              ? "Post-demo update follow-up"
              : "Quotation update follow-up");
          const existingCb = await client.query(
            `SELECT id FROM scheduled_tasks
             WHERE lead_id = $1 AND tenant_id = $2 AND task_type = 'callback' AND status = 'pending'
             ORDER BY updated_at DESC LIMIT 1`,
            [leadId, tenantId]
          );
          if (existingCb.rows.length > 0) {
            await client.query(
              `UPDATE scheduled_tasks
               SET scheduled_time = $1, notes = $2, rep_id = COALESCE($3, rep_id), task_source = 'pipeline', updated_at = NOW()
               WHERE id = $4 AND tenant_id = $5`,
              [cbDateObj, cbNote, repId, existingCb.rows[0].id, tenantId]
            );
          } else {
            await client.query(
              `INSERT INTO scheduled_tasks (
                 tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at
               )
               VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', 'pipeline', NOW(), NOW())`,
              [tenantId, leadId, repId, cbDateObj, cbNote]
            );
          }
        }
      }

      // Closed Lost recontact callback task
      if (primaryStage === "closed_lost" && firstComm.recontactDate) {
        await client.query(
          `INSERT INTO scheduled_tasks (
             tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', 'pipeline', NOW(), NOW())`,
          [
            tenantId,
            leadId,
            repId,
            parseScheduledDateTime(firstComm.recontactDate),
            firstComm.lostRemarks
              ? `Closed Lost Re-contact: ${firstComm.lostRemarks}`
              : "Closed Lost re-contact follow-up",
          ]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ deal: primaryDeal, totalCreated: commercials.length }, { status: 201 });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[DEALS POST]", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
