import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isSalesRep } from "@/lib/rbac";
import { isValidUuid, sanitizeExternalUrl } from "@/lib/security";
import { ensureDealSplitsTable } from "@/lib/deal-splits";

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const role = session.role;
  const repId = session.sub;

  const { searchParams } = new URL(request.url);
  const opsStatus = searchParams.get("status") || "pending_verification";
  const filterRepId = searchParams.get("repId");

  if (filterRepId && filterRepId !== "all" && !isValidUuid(filterRepId)) {
    return NextResponse.json({ error: "Invalid repId" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      await ensureDealSplitsTable(client);
      const isRep = isSalesRep(role);
      let whereClause: string;
      let params: any[];

      const splitRepMatch = (idx: number) =>
        `EXISTS (SELECT 1 FROM deal_splits ds WHERE ds.deal_id = p.deal_id AND ds.tenant_id = p.tenant_id AND ds.rep_id = $${idx})`;

      if (isRep) {
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
         LEFT JOIN deals d ON p.deal_id = d.id AND d.tenant_id = p.tenant_id
         LEFT JOIN leads l ON p.lead_id = l.id AND l.tenant_id = p.tenant_id
         LEFT JOIN users ru ON p.rep_id = ru.id AND ru.tenant_id = p.tenant_id
         LEFT JOIN users au ON p.approved_by = au.id AND au.tenant_id = p.tenant_id
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
           WHERE ds.deal_id = p.deal_id AND ds.tenant_id = p.tenant_id
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
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  try {
    const body = await request.json();
    const {
      dealId,
      leadId,
      userType,
      panelUserId,
      creditsToAdd,
      originalAmount,
      taxAmount = 0,
      tdsAmount = 0,
      finalAmount,
      paymentMode,
      gstin,
      screenshotUrl,
    } = body;

    if (!isValidUuid(dealId)) {
      return NextResponse.json({ error: "Valid dealId is required" }, { status: 400 });
    }
    if (leadId !== undefined && leadId !== null && !isValidUuid(leadId)) {
      return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
    }

    const numCredits = Number(creditsToAdd ?? 0);
    const numOriginal = Number(originalAmount ?? 0);
    const numTax = Number(taxAmount ?? 0);
    const numTds = Number(tdsAmount ?? 0);
    const numFinal = Number(finalAmount ?? 0);
    if (
      !Number.isFinite(numCredits) || numCredits < 0 ||
      !Number.isFinite(numOriginal) || numOriginal < 0 ||
      !Number.isFinite(numTax) || numTax < 0 ||
      !Number.isFinite(numTds) || numTds < 0 ||
      !Number.isFinite(numFinal) || numFinal <= 0
    ) {
      return NextResponse.json(
        { error: "Financial amounts and credits must be valid non-negative numbers (finalAmount > 0)" },
        { status: 400 }
      );
    }

    let safeScreenshot = "NA";
    if (typeof screenshotUrl === "string" && screenshotUrl.trim() && screenshotUrl.trim() !== "NA") {
      const validated = sanitizeExternalUrl(screenshotUrl, { allowRelative: true });
      if (!validated) {
        return NextResponse.json({ error: "Invalid screenshot URL" }, { status: 400 });
      }
      safeScreenshot = validated;
    }

    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const dealRes = await client.query(
          `SELECT id, lead_id as "leadId", rep_id as "repId", stage
           FROM deals
           WHERE id = $1 AND tenant_id = $2
           LIMIT 1`,
          [dealId, tenantId]
        );
        if (dealRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Deal not found" }, { status: 404 });
        }
        const deal = dealRes.rows[0];
        if (leadId && deal.leadId && leadId !== deal.leadId) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "leadId does not match the specified deal" }, { status: 400 });
        }
        const resolvedLeadId = deal.leadId || leadId || null;
        if (resolvedLeadId) {
          const leadCheck = await client.query(
            `SELECT id, assigned_rep_id as "assignedRepId" FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
            [resolvedLeadId, tenantId]
          );
          if (leadCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Lead not found in workspace" }, { status: 404 });
          }
          if (isSalesRep(role) && deal.repId !== repId && leadCheck.rows[0].assignedRepId !== repId) {
            await client.query("ROLLBACK");
            return NextResponse.json(
              { error: "Forbidden: You can only submit payments for your assigned deals." },
              { status: 403 }
            );
          }
        } else if (isSalesRep(role) && deal.repId !== repId) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Forbidden: You can only submit payments for your assigned deals." },
            { status: 403 }
          );
        }

        const existingApproved = await client.query(
          `SELECT id FROM payments WHERE deal_id = $1 AND tenant_id = $2 AND ops_approval_status = 'approved' LIMIT 1`,
          [dealId, tenantId]
        );
        if (existingApproved.rows.length > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "An approved payment already exists for this deal." },
            { status: 409 }
          );
        }

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
            resolvedLeadId,
            repId,
            userType || "new_user",
            panelUserId || null,
            Math.round(numCredits),
            numOriginal,
            numTax,
            numTds,
            numFinal,
            paymentMode || "Bank Transfer",
            gstin || null,
            safeScreenshot,
          ]
        );

        // Move deal to payment_pending if not already won
        await client.query(
          "UPDATE deals SET stage = 'payment_pending', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND stage <> 'closed_won'",
          [dealId, tenantId]
        );

        await client.query("COMMIT");
        return NextResponse.json({ payment: paymentRes.rows[0] }, { status: 201 });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[PAYMENTS POST]", error);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
