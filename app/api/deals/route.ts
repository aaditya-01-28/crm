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
      const dealsRes = await client.query(
        `SELECT d.id, d.tenant_id as "tenantId", d.lead_id as "leadId", d.rep_id as "repId",
                d.service_type as "serviceType", d.quantity, d.quoted_price as "quotedPrice",
                d.expected_closing_date as "expectedClosingDate", d.stage, d.closing_notes as "closingNotes",
                d.created_at as "createdAt", d.updated_at as "updatedAt",
                l.phone_number as "lead_phoneNumber", l.contact_name as "lead_contactName",
                l.company_name as "lead_companyName", l.business_vertical as "lead_businessVertical",
                u.full_name as "rep_fullName"
         FROM deals d
         LEFT JOIN leads l ON d.lead_id = l.id
         LEFT JOIN users u ON d.rep_id = u.id
         WHERE d.tenant_id = $1 ${isRep ? "AND d.rep_id = $2" : ""}
         ORDER BY d.created_at DESC`,
        isRep ? [tenantId, repId] : [tenantId]
      );

      const deals = dealsRes.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        leadId: r.leadId,
        repId: r.repId,
        serviceType: r.serviceType,
        quantity: r.quantity,
        quotedPrice: r.quotedPrice,
        expectedClosingDate: r.expectedClosingDate,
        stage: r.stage,
        closingNotes: r.closingNotes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lead: {
          phoneNumber: r.lead_phoneNumber,
          contactName: r.lead_contactName,
          companyName: r.lead_companyName,
          businessVertical: r.lead_businessVertical,
        },
        rep: { fullName: r.rep_fullName },
      }));

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

      const dealRes = await client.query(
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
          body.serviceType,
          body.quantity,
          body.quotedPrice,
          body.expectedClosingDate ? new Date(body.expectedClosingDate) : null,
          body.stage || "quote_sent",
          body.closingNotes || null,
        ]
      );

      const deal = dealRes.rows[0];
      return NextResponse.json({ deal }, { status: 201 });
    });
  } catch (error) {
    console.error("[DEALS POST]", error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
