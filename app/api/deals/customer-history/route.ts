import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isValidUuid } from "@/lib/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface AccountHistoryItem {
  serviceType: string;
  productName: string;
  panelUserId: string;
  userType: string;
  customerEmail: string | null;
  gstin: string | null;
  finalAmount: number;
  wonDate: string | null;
}

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.tenantId;
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId")?.trim() || null;
  const rawPhone = searchParams.get("phone")?.trim() || "";
  const phoneDigits = rawPhone.replace(/\D/g, "");
  const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;

  if (!leadId && phoneSuffix.length < 7) {
    return NextResponse.json({
      isExistingCustomer: false,
      latestCustomerEmail: null,
      latestGstin: null,
      latestPaymentMode: null,
      accountsByService: [],
    });
  }

  try {
    return await withClient(async (client) => {
      // Resolve all matching lead IDs (selected lead + any duplicate leads with matching last-10 phone digits)
      const matchedLeadIds = new Set<string>();
      let leadFallbackEmail: string | null = null;

      if (isValidUuid(leadId)) {
        const lRes = await client.query(
          `SELECT id, phone_number, custom_metadata FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [leadId, tenantId]
        );
        if (lRes.rows.length > 0) {
          matchedLeadIds.add(lRes.rows[0].id);
          const meta = lRes.rows[0].custom_metadata as Record<string, any> | null;
          leadFallbackEmail = meta?.customerEmail || meta?.email || null;
          const dbPhone = String(lRes.rows[0].phone_number || "").replace(/\D/g, "");
          const suffix = dbPhone.length >= 10 ? dbPhone.slice(-10) : dbPhone;
          if (suffix.length >= 7 && !phoneSuffix) {
            const dupLeads = await client.query(
              `SELECT id FROM leads WHERE tenant_id = $1 AND RIGHT(REGEXP_REPLACE(phone_number, '\\D', '', 'g'), 10) = $2`,
              [tenantId, suffix]
            );
            dupLeads.rows.forEach((r) => matchedLeadIds.add(r.id));
          }
        }
      }

      if (phoneSuffix.length >= 7) {
        const dupLeads = await client.query(
          `SELECT id, custom_metadata FROM leads WHERE tenant_id = $1 AND RIGHT(REGEXP_REPLACE(phone_number, '\\D', '', 'g'), 10) = $2`,
          [tenantId, phoneSuffix]
        );
        for (const r of dupLeads.rows) {
          matchedLeadIds.add(r.id);
          if (!leadFallbackEmail) {
            const meta = r.custom_metadata as Record<string, any> | null;
            leadFallbackEmail = meta?.customerEmail || meta?.email || null;
          }
        }
      }

      const leadIds = Array.from(matchedLeadIds);
      if (leadIds.length === 0) {
        return NextResponse.json({
          isExistingCustomer: false,
          latestCustomerEmail: leadFallbackEmail,
          latestGstin: null,
          latestPaymentMode: null,
          accountsByService: [],
        });
      }

      const historyRes = await client.query(
        `SELECT d.id as "dealId", d.service_type as "serviceType", d.stage, d.closing_notes as "closingNotes",
                d.quoted_price as "quotedPrice", d.created_at as "createdAt",
                p.id as "paymentId", p.panel_user_id as "panelUserId", p.user_type as "userType",
                p.gstin, p.payment_mode as "paymentMode", p.final_amount as "finalAmount",
                p.ops_approval_status as "opsApprovalStatus"
         FROM deals d
         LEFT JOIN LATERAL (
           SELECT id, panel_user_id, user_type, gstin, payment_mode, final_amount, ops_approval_status, created_at
           FROM payments
           WHERE deal_id = d.id AND tenant_id = d.tenant_id
           ORDER BY created_at DESC
           LIMIT 1
         ) p ON true
         WHERE d.tenant_id = $1
           AND d.lead_id = ANY($2::uuid[])
           AND (d.stage = 'closed_won' OR d.stage = 'won' OR (p.id IS NOT NULL AND p.ops_approval_status <> 'rejected'))
         ORDER BY COALESCE(p.created_at, d.created_at) DESC`,
        [tenantId, leadIds]
      );

      let latestCustomerEmail: string | null = leadFallbackEmail;
      let latestGstin: string | null = null;
      let latestPaymentMode: string | null = null;
      const accountsByService: AccountHistoryItem[] = [];

      for (const row of historyRes.rows) {
        let parsedNotes: Record<string, any> | null = null;
        if (row.closingNotes) {
          try {
            const obj = JSON.parse(row.closingNotes);
            if (obj && typeof obj === "object") parsedNotes = obj;
          } catch {}
        }

        const email =
          typeof parsedNotes?.customerEmail === "string" && parsedNotes.customerEmail.trim()
            ? parsedNotes.customerEmail.trim()
            : null;
        const gstin =
          (typeof row.gstin === "string" && row.gstin.trim()) ||
          (typeof parsedNotes?.gstinNumber === "string" && parsedNotes.gstinNumber.trim()) ||
          null;
        const paymentMode =
          (typeof row.paymentMode === "string" && row.paymentMode.trim()) ||
          (typeof parsedNotes?.paymentMode === "string" && parsedNotes.paymentMode.trim()) ||
          null;
        const panelUserId =
          (typeof row.panelUserId === "string" && row.panelUserId.trim()) ||
          (typeof parsedNotes?.userId === "string" && parsedNotes.userId.trim()) ||
          "";

        if (!latestCustomerEmail && email) latestCustomerEmail = email;
        if (!latestGstin && gstin) latestGstin = gstin;
        if (!latestPaymentMode && paymentMode) latestPaymentMode = paymentMode;

        accountsByService.push({
          serviceType: row.serviceType || "",
          productName: parsedNotes?.productName || row.serviceType || "",
          panelUserId,
          userType: row.userType || parsedNotes?.userType || "new_user",
          customerEmail: email,
          gstin,
          finalAmount: Number(row.finalAmount || parsedNotes?.finalAmount || row.quotedPrice || 0),
          wonDate: parsedNotes?.wonDate || null,
        });
      }

      return NextResponse.json({
        isExistingCustomer: historyRes.rows.length > 0,
        latestCustomerEmail,
        latestGstin,
        latestPaymentMode,
        accountsByService,
      });
    });
  } catch (error) {
    console.error("[CUSTOMER HISTORY GET]", error);
    return NextResponse.json(
      { error: "Failed to check customer history" },
      { status: 500 }
    );
  }
}
