import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const role = request.headers.get("x-user-role") || session?.role || "";

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isRep = role === "sales_rep";

  try {
    return await withClient(async (client) => {
      // Auto-heal: Ensure all closed won/lost leads have matching deals in the pipeline
      try {
        // Auto-create deals for won leads without deals
        await client.query(
          `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
           SELECT l.tenant_id, l.id, COALESCE(l.assigned_rep_id, $1), COALESCE(l.service_type, 'WhatsApp API'), 10000, 0, 'closed_won', 'Closed Won Lead', NOW(), NOW()
           FROM leads l
           WHERE l.tenant_id = $2 AND l.status IN ('won', 'closed_won')
             AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = l.id)`,
          [repId, tenantId]
        );

        // Auto-create deals for lost leads without deals
        await client.query(
          `INSERT INTO deals (tenant_id, lead_id, rep_id, service_type, quantity, quoted_price, stage, closing_notes, created_at, updated_at)
           SELECT l.tenant_id, l.id, COALESCE(l.assigned_rep_id, $1), COALESCE(l.service_type, 'WhatsApp API'), 10000, 0, 'closed_lost', 'Closed Lost Lead', NOW(), NOW()
           FROM leads l
           WHERE l.tenant_id = $2 AND l.status IN ('lost', 'closed_lost')
             AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = l.id)`,
          [repId, tenantId]
        );

        // Auto-sync deal stage if lead status is won but deal is in an earlier stage
        await client.query(
          `UPDATE deals d
           SET stage = 'closed_won', updated_at = NOW()
           FROM leads l
           WHERE d.lead_id = l.id AND l.tenant_id = $1 AND l.status IN ('won', 'closed_won') AND d.stage NOT IN ('closed_won', 'won')`,
          [tenantId]
        );

        // Auto-sync deal stage if lead status is lost but deal is in an earlier stage
        await client.query(
          `UPDATE deals d
           SET stage = 'closed_lost', updated_at = NOW()
           FROM leads l
           WHERE d.lead_id = l.id AND l.tenant_id = $1 AND l.status IN ('lost', 'closed_lost') AND d.stage NOT IN ('closed_lost', 'lost')`,
          [tenantId]
        );
      } catch (syncErr) {
        console.warn("[DEALS SYNC WARNING]", syncErr);
      }

      const dealsRes = await client.query(
        `SELECT d.id, d.tenant_id as "tenantId", d.lead_id as "leadId", d.rep_id as "repId",
                d.service_type as "serviceType", d.quantity, d.quoted_price as "quotedPrice",
                d.expected_closing_date as "expectedClosingDate", d.stage, d.closing_notes as "closingNotes",
                d.created_at as "createdAt", d.updated_at as "updatedAt",
                l.phone_number as "lead_phoneNumber", l.contact_name as "lead_contactName",
                l.company_name as "lead_companyName", l.business_vertical as "lead_businessVertical",
                COALESCE(u.full_name, rep_lead.full_name, 'Assigned Representative') as "rep_fullName"
         FROM deals d
         LEFT JOIN leads l ON d.lead_id = l.id
         LEFT JOIN users u ON d.rep_id = u.id
         LEFT JOIN users rep_lead ON l.assigned_rep_id = rep_lead.id
         WHERE d.tenant_id = $1 ${isRep ? "AND (d.rep_id = $2 OR l.assigned_rep_id = $2)" : ""}
         ORDER BY d.created_at DESC`,
        isRep ? [tenantId, repId] : [tenantId]
      );

      const deals = dealsRes.rows.map((r) => {
        let normalizedStage = r.stage;
        if (normalizedStage === "won") normalizedStage = "closed_won";
        if (normalizedStage === "lost") normalizedStage = "closed_lost";

        return {
          id: r.id,
          tenantId: r.tenantId,
          leadId: r.leadId,
          repId: r.repId,
          serviceType: r.serviceType,
          quantity: r.quantity,
          quotedPrice: r.quotedPrice,
          expectedClosingDate: r.expectedClosingDate,
          stage: normalizedStage,
          closingNotes: r.closingNotes,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          lead: {
            phoneNumber: r.lead_phoneNumber || "",
            contactName: r.lead_contactName,
            companyName: r.lead_companyName,
            businessVertical: r.lead_businessVertical,
          },
          rep: { fullName: r.rep_fullName },
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
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    return await withClient(async (client) => {
      let leadId = body.leadId;

      // If leadId is not provided, find or create the lead by phone number
      if (!leadId) {
        if (!body.phoneNumber) {
          return NextResponse.json(
            { error: "Phone number or an existing lead is required" },
            { status: 400 }
          );
        }

        const phone = body.phoneNumber.trim();
        // Check if lead already exists with this phone in this tenant
        const existingLeadRes = await client.query(
          `SELECT id, custom_metadata FROM leads WHERE tenant_id = $1 AND phone_number = $2 LIMIT 1`,
          [tenantId, phone]
        );

        if (existingLeadRes.rows.length > 0) {
          leadId = existingLeadRes.rows[0].id;
          const oldMeta = (existingLeadRes.rows[0].custom_metadata as Record<string, any>) || {};
          const updatedMeta = { ...oldMeta, ...(body.address ? { address: body.address } : {}) };

          await client.query(
            `UPDATE leads 
             SET contact_name = COALESCE($1, contact_name),
                 company_name = COALESCE($2, company_name),
                 service_type = COALESCE($3, service_type),
                 custom_metadata = $4,
                 status = 'deal_created',
                 updated_at = NOW()
             WHERE id = $5`,
            [
              body.contactName || null,
              body.companyName || null,
              body.serviceType || null,
              JSON.stringify(updatedMeta),
              leadId,
            ]
          );
        } else {
          // Create new lead in database
          const newMeta = body.address ? { address: body.address } : {};
          const newLeadRes = await client.query(
            `INSERT INTO leads (
               tenant_id, assigned_rep_id, first_assigned_rep_id, first_assigned_at,
               phone_number, contact_name, company_name, service_type,
               source, status, custom_metadata, created_at, updated_at
             )
             VALUES ($1, $2, $2, NOW(), $3, $4, $5, $6, 'Pipeline Manual Entry', 'deal_created', $7, NOW(), NOW())
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
        // Update existing lead details if provided
        const existingLeadRes = await client.query(
          `SELECT id, custom_metadata FROM leads WHERE id = $1 AND tenant_id = $2`,
          [leadId, tenantId]
        );
        if (existingLeadRes.rows.length > 0) {
          const oldMeta = (existingLeadRes.rows[0].custom_metadata as Record<string, any>) || {};
          const updatedMeta = { ...oldMeta, ...(body.address ? { address: body.address } : {}) };
          await client.query(
            `UPDATE leads
             SET contact_name = COALESCE($1, contact_name),
                 company_name = COALESCE($2, company_name),
                 service_type = COALESCE($3, service_type),
                 custom_metadata = $4,
                 status = 'deal_created',
                 updated_at = NOW()
             WHERE id = $5`,
            [
              body.contactName || null,
              body.companyName || null,
              body.serviceType || null,
              JSON.stringify(updatedMeta),
              leadId,
            ]
          );
        }
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
        const itemRes = await client.query(
          `INSERT INTO deals (
             tenant_id, lead_id, rep_id, service_type, quantity, quoted_price,
             expected_closing_date, stage, closing_notes, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           RETURNING id, tenant_id as "tenantId", lead_id as "leadId", rep_id as "repId",
                     service_type as "serviceType", quantity, quoted_price as "quotedPrice",
                     expected_closing_date as "expectedClosingDate", stage, closing_notes as "closingNotes",
                     created_at as "createdAt", updated_at as "updatedAt"`,
          [
            tenantId,
            leadId,
            repId,
            item.serviceType,
            parseInt(item.quantity) || 0,
            parseFloat(item.quotedPrice) || 0,
            item.expectedClosingDate ? new Date(item.expectedClosingDate) : null,
            item.stage || "quote_sent",
            item.closingNotes || null,
          ]
        );
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

      await client.query("UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2", [
        leadStatus,
        leadId,
      ]);

      const firstComm = commercials[0] || {};
      const wonDetails = body.wonDetails || firstComm;

      // Closed Won payment dossier record
      if (primaryStage === "closed_won" && (wonDetails.userId || wonDetails.panelUserId)) {
        await client.query(
          `INSERT INTO payments (
             tenant_id, deal_id, lead_id, rep_id, user_type, panel_user_id,
             credits_to_add, original_amount, tax_amount, tds_amount, final_amount,
             payment_mode, gstin, screenshot_url, ops_approval_status, credits_provisioned, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending_verification', false, NOW())`,
          [
            tenantId,
            primaryDeal.id,
            leadId,
            repId,
            wonDetails.userType || "new_user",
            wonDetails.userId || wonDetails.panelUserId || "PORTAL_USER",
            parseInt(wonDetails.creditsToAdd || firstComm.quantity) || 0,
            parseFloat(wonDetails.originalAmount || firstComm.quotedPrice) || 0,
            parseFloat(wonDetails.taxAmount || 0) || 0,
            parseFloat(wonDetails.tds || 0) || 0,
            parseFloat(wonDetails.finalAmount || firstComm.quotedPrice) || 0,
            wonDetails.paymentMode || "Bank Transfer",
            wonDetails.gstinNumber || null,
            wonDetails.paymentScreenshotUrl || "https://placeholder-payment-ref",
          ]
        );
      }

      // Demo Scheduled calendar task
      if (primaryStage === "demo_scheduled" && firstComm.demoDate) {
        await client.query(
          `INSERT INTO scheduled_tasks (
             tenant_id, lead_id, rep_id, task_type, scheduled_time, meeting_link, notes, status, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'product_demo', $4, $5, $6, 'pending', NOW(), NOW())`,
          [
            tenantId,
            leadId,
            repId,
            new Date(firstComm.demoDate),
            firstComm.meetingLink || null,
            firstComm.demoNotes || firstComm.closingNotes || null,
          ]
        );
      }

      // Demo Done & Quote Sent contact back callback task
      if (
        (primaryStage === "demo_done" || primaryStage === "quote_sent") &&
        firstComm.contactBackDate
      ) {
        await client.query(
          `INSERT INTO scheduled_tasks (
             tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', NOW(), NOW())`,
          [
            tenantId,
            leadId,
            repId,
            new Date(firstComm.contactBackDate),
            firstComm.closingNotes ||
              (primaryStage === "demo_done"
                ? "Post-demo update follow-up"
                : "Quotation update follow-up"),
          ]
        );
      }

      // Closed Lost recontact callback task
      if (primaryStage === "closed_lost" && firstComm.recontactDate) {
        await client.query(
          `INSERT INTO scheduled_tasks (
             tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, created_at, updated_at
           )
           VALUES ($1, $2, $3, 'callback', $4, $5, 'pending', NOW(), NOW())`,
          [
            tenantId,
            leadId,
            repId,
            new Date(firstComm.recontactDate),
            firstComm.lostRemarks
              ? `Closed Lost Re-contact: ${firstComm.lostRemarks}`
              : "Closed Lost re-contact follow-up",
          ]
        );
      }

      return NextResponse.json({ deal: primaryDeal, totalCreated: commercials.length }, { status: 201 });
    });
  } catch (error) {
    console.error("[DEALS POST]", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
