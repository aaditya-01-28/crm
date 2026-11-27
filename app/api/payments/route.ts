import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ensureDealSplitsTable } from "@/lib/deal-splits";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const role = session.role;
  const repId = session.sub;

  const { searchParams } = new URL(request.url);
  const opsStatus = searchParams.get("status") || "pending_verification";
  const filterRepId = searchParams.get("repId");

  try {
    return await withClient(async (client) => {
      await ensureDealSplitsTable(client);
      // Fix: Rep view shows only their PENDING payments (for submission tracking).
      // Ops/Manager view filters by ops_approval_status tab (pending/approved/rejected) — strictly exclusive.
      const isRep = role === "sales_rep";
      let whereClause: string;
      let params: any[];

      const splitRepMatch = (idx: number) =>
        `EXISTS (SELECT 1 FROM deal_splits ds WHERE ds.deal_id = p.deal_id AND ds.rep_id = $${idx})`;

      if (isRep) {
        // Reps see their own / assigned leads' / split-partner payments across Pending, Approved, and Rejected (read-only)
        if (opsStatus === "pending_verification") {
          whereClause =
            `p.tenant_id = $1 AND (p.rep_id = $2 OR l.assigned_rep_id = $2 OR d.rep_id = $2 OR ${splitRepMatch(2)}) AND p.ops_approval_status IN ('pending_verification', 'pending')`;
          params = [tenantId, repId];
        } else {
          whereClause =
            `p.tenant_id = $1 AND (p.rep_id = $2 OR l.assigned_rep_id = $2 OR d.rep_id = $2 OR ${splitRepMatch(2)}) AND p.ops_approval_status = $3`;
          params = [tenantId, repId, opsStatus];
        }
      } else {
        // Ops/Manager/Admin see payments filtered by exact status tab — no cross-tab bleed
        if (opsStatus === "pending_verification") {
          whereClause = "p.tenant_id = $1 AND p.ops_approval_status IN ('pending_verification', 'pending')";
          params = [tenantId];
        } else {
          whereClause = "p.tenant_id = $1 AND p.ops_approval_status = $2";
          params = [tenantId, opsStatus];
        }

        if (filterRepId && filterRepId !== "all") {
          const idx = params.push(filterRepId);
          whereClause += ` AND (p.rep_id = $${idx} OR ${splitRepMatch(idx)})`;
        }
      }

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
                au.full_name as "approver_fullName",
                sp.splits_json as "splitsJson"
         FROM payments p
         LEFT JOIN deals d ON p.deal_id = d.id
         LEFT JOIN leads l ON p.lead_id = l.id
         LEFT JOIN users ru ON p.rep_id = ru.id
         LEFT JOIN users au ON p.approved_by = au.id
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
           LEFT JOIN users su ON ds.rep_id = su.id
           WHERE ds.deal_id = p.deal_id
         ) sp ON true
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
        splits: Array.isArray(r.splitsJson) ? r.splitsJson : [],
      }));

      return NextResponse.json({ payments });
    });
  } catch (error) {
    console.error("[PAYMENTS GET]", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;

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
