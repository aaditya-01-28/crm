import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const role = request.headers.get("x-user-role") || session?.role || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const opsStatus = searchParams.get("status") || "pending_verification";

  try {
    return await withClient(async (client) => {
      const isRep = role === "sales_rep";
      const whereClause = isRep
        ? "p.tenant_id = $1 AND p.rep_id = $2"
        : "p.tenant_id = $1 AND p.ops_approval_status = $2";
      const params = isRep ? [tenantId, repId] : [tenantId, opsStatus];

      const paymentsRes = await client.query(
        `SELECT p.id, p.tenant_id as "tenantId", p.deal_id as "dealId", p.lead_id as "leadId",
                p.rep_id as "repId", p.user_type as "userType", p.panel_user_id as "panelUserId",
                p.credits_to_add as "creditsToAdd", p.original_amount as "originalAmount",
                p.tax_amount as "taxAmount", p.tds_amount as "tdsAmount", p.final_amount as "finalAmount",
                p.payment_mode as "paymentMode", p.gstin, p.screenshot_url as "screenshotUrl",
                p.ops_approval_status as "opsApprovalStatus", p.approved_by as "approvedBy",
                p.credits_provisioned as "creditsProvisioned", p.created_at as "createdAt",
                d.service_type as "deal_serviceType", d.quoted_price as "deal_quotedPrice",
                l.contact_name as "lead_contactName", l.company_name as "lead_companyName", l.phone_number as "lead_phoneNumber",
                ru.full_name as "rep_fullName", ru.email as "rep_email",
                au.full_name as "approver_fullName"
         FROM payments p
         LEFT JOIN deals d ON p.deal_id = d.id
         LEFT JOIN leads l ON p.lead_id = l.id
         LEFT JOIN users ru ON p.rep_id = ru.id
         LEFT JOIN users au ON p.approved_by = au.id
         WHERE ${whereClause}
         ORDER BY p.created_at DESC`,
        params
      );

      const payments = paymentsRes.rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        dealId: r.dealId,
        leadId: r.leadId,
        repId: r.repId,
        userType: r.userType,
        panelUserId: r.panelUserId,
        creditsToAdd: r.creditsToAdd,
        originalAmount: r.originalAmount,
        taxAmount: r.taxAmount,
        tdsAmount: r.tdsAmount,
        finalAmount: r.finalAmount,
        paymentMode: r.paymentMode,
        gstin: r.gstin,
        screenshotUrl: r.screenshotUrl,
        opsApprovalStatus: r.opsApprovalStatus,
        approvedBy: r.approvedBy,
        creditsProvisioned: r.creditsProvisioned,
        createdAt: r.createdAt,
        deal: {
          serviceType: r.deal_serviceType,
          quotedPrice: r.deal_quotedPrice,
        },
        lead: {
          contactName: r.lead_contactName,
          companyName: r.lead_companyName,
          phoneNumber: r.lead_phoneNumber,
        },
        rep: {
          fullName: r.rep_fullName,
          email: r.rep_email,
        },
        approver: r.approver_fullName ? { fullName: r.approver_fullName } : null,
      }));

      return NextResponse.json({ payments });
    });
  } catch (error) {
    console.error("[PAYMENTS GET]", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
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
    const {
      dealId,
      leadId,
      userType,
      panelUserId,
      creditsToAdd,
      originalAmount,
      taxAmount,
      tdsAmount = 0,
      finalAmount,
      paymentMode,
      gstin,
      screenshotUrl,
    } = body;

    return await withClient(async (client) => {
      const paymentRes = await client.query(
        `INSERT INTO payments (
           tenant_id, deal_id, lead_id, rep_id, user_type, panel_user_id,
           credits_to_add, original_amount, tax_amount, tds_amount, final_amount,
           payment_mode, gstin, screenshot_url, ops_approval_status, credits_provisioned, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending_verification', false, NOW())
         RETURNING id, tenant_id as "tenantId", deal_id as "dealId", lead_id as "leadId",
                   rep_id as "repId", user_type as "userType", panel_user_id as "panelUserId",
                   credits_to_add as "creditsToAdd", original_amount as "originalAmount",
                   tax_amount as "taxAmount", tds_amount as "tdsAmount", final_amount as "finalAmount",
                   payment_mode as "paymentMode", gstin, screenshot_url as "screenshotUrl",
                   ops_approval_status as "opsApprovalStatus", credits_provisioned as "creditsProvisioned",
                   created_at as "createdAt"`,
        [
          tenantId,
          dealId,
          leadId,
          repId,
          userType,
          panelUserId,
          creditsToAdd,
          originalAmount,
          taxAmount,
          tdsAmount,
          finalAmount,
          paymentMode,
          gstin || null,
          screenshotUrl || null,
        ]
      );

      // Move deal to payment_pending if not already won
      await client.query(
        "UPDATE deals SET stage = 'payment_pending', updated_at = NOW() WHERE id = $1 AND stage <> 'closed_won'",
        [dealId]
      );

      return NextResponse.json({ payment: paymentRes.rows[0] }, { status: 201 });
    });
  } catch (error) {
    console.error("[PAYMENTS POST]", error);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
