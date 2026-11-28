import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requireActiveSession } from "@/lib/auth";
import { isValidUuid } from "@/lib/security";

interface ImportedLead {
  phone: string | number;
  secondaryPhone?: string;
  name?: string;
  company?: string;
  email?: string;
  vertical?: string;
  service?: string;
  website?: string;
  source?: string;
  remark?: string;
  leadDate?: string;
  closeDate?: string;
  userId?: string;
  credits?: number;
  amount?: number;
  stage?: string;
  duplicateAction?: "skip" | "update";
}

function cleanPhoneNumber(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let str = String(raw).trim();
  if (str.includes("/") || str.includes(",")) {
    str = str.split(/[\/,]/)[0].trim();
  }
  if (str.includes(".") && !str.toLowerCase().includes("e")) {
    str = str.split(".")[0];
  }
  const digits = str.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function parseSheetDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Excel serial date number (e.g. 46259 -> 2026-08-25)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 30000 && serial < 80000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000 + 5.5 * 3600000);
    }
  }

  // DD-MM-YY or DD-MM-YYYY or DD/MM/YY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 5, 30, 0));
    }
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    return new Date(
      Date.UTC(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 5, 30, 0)
    );
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function mapStageToDb(
  lead: ImportedLead,
  sheetType: string
): {
  leadStatus: string;
  disposition: string;
  isClosedDeal: boolean;
} {
  const explicit = (lead.stage || "").toLowerCase().trim();
  const remark = (lead.remark || "").toLowerCase();
  const hasAmount = Number(lead.amount || 0) > 0;

  if (
    sheetType === "closed_deal" ||
    explicit === "closed_deal" ||
    explicit === "closed" ||
    explicit === "won" ||
    (sheetType === "auto" && (hasAmount || Boolean(lead.closeDate)))
  ) {
    return { leadStatus: "deal_created", disposition: "Deal Pending Approval", isClosedDeal: true };
  }

  if (sheetType === "interested" || explicit === "interested") {
    if (remark.includes("already purchased")) {
      return { leadStatus: "already_purchased", disposition: "Already Purchased", isClosedDeal: false };
    }
    return { leadStatus: "interested", disposition: "Interested", isClosedDeal: false };
  }

  if (sheetType === "followup" || explicit === "callback" || explicit === "followup") {
    return { leadStatus: "callback", disposition: "Callback", isClosedDeal: false };
  }

  if (explicit === "demo_scheduled") {
    return { leadStatus: "demo_scheduled", disposition: "Demo Scheduled", isClosedDeal: false };
  }

  if (explicit === "demo_done") {
    return { leadStatus: "demo_done", disposition: "Demo Done", isClosedDeal: false };
  }

  if (sheetType === "auto" && remark) {
    if (remark.includes("demo done")) {
      return { leadStatus: "demo_done", disposition: "Demo Done", isClosedDeal: false };
    }
    if (remark.includes("demo")) {
      return { leadStatus: "demo_scheduled", disposition: "Demo Scheduled", isClosedDeal: false };
    }
    if (remark.includes("interested") || remark.includes("intrested")) {
      return { leadStatus: "interested", disposition: "Interested", isClosedDeal: false };
    }
    if (remark.includes("call back") || remark.includes("callback")) {
      return { leadStatus: "callback", disposition: "Callback", isClosedDeal: false };
    }
  }

  return { leadStatus: "new", disposition: "Connected", isClosedDeal: false };
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const uploaderId = session.sub;
  const role = session.role;

  if (!can(role, "leads:import")) {
    return NextResponse.json(
      { error: "Forbidden: Only managers and admins can import leads" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      leads,
      assignToRepId,
      assignmentMode,
      sheetType = "cold",
      defaultDuplicateAction = "skip",
    }: {
      leads: ImportedLead[];
      assignToRepId?: string | null;
      assignmentMode?: "unassigned" | "specific" | "round_robin";
      sheetType?: "auto" | "cold" | "followup" | "interested" | "closed_deal";
      defaultDuplicateAction?: "skip" | "update";
    } = body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    if (leads.length > 5000) {
      return NextResponse.json(
        { error: "Batch size exceeds maximum limit of 5,000 leads per import." },
        { status: 400 }
      );
    }

    const processed = leads.map((l) => ({
      ...l,
      phone: cleanPhoneNumber(l.phone),
    }));

    const validLeads = processed.filter((l) => l.phone.length === 10);

    if (validLeads.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid 10-digit phone numbers detected. Please ensure your sheet contains 10-digit mobile numbers.",
        },
        { status: 400 }
      );
    }

    // For Closed Deals, a single customer can have multiple repeat purchases in the same sheet (like K NAGA PRASAD or Dharmandar Verma in the sheet!).
    // For non-closed-deal sheets, deduplicate within the batch.
    const seenInBatch = new Set<string>();
    const batchLeads: typeof validLeads = [];
    let batchDuplicatesCount = 0;

    for (const item of validLeads) {
      const stageInfo = mapStageToDb(item, sheetType);
      if (seenInBatch.has(item.phone) && !stageInfo.isClosedDeal) {
        batchDuplicatesCount++;
      } else {
        seenInBatch.add(item.phone);
        batchLeads.push(item);
      }
    }

    return await withClient(async (client) => {
      const phones = Array.from(new Set(batchLeads.map((l) => l.phone)));
      const existingRes = await client.query(
        `SELECT id, phone_number, custom_metadata,
                RIGHT(REGEXP_REPLACE(phone_number, '\\D', '', 'g'), 10) as norm_phone
         FROM leads
         WHERE tenant_id = $1
           AND (
             phone_number = ANY($2::varchar[])
             OR RIGHT(REGEXP_REPLACE(phone_number, '\\D', '', 'g'), 10) = ANY($2::text[])
           )
         ORDER BY updated_at DESC`,
        [tenantId, phones]
      );

      const existingMap = new Map<string, { id: string; custom_metadata: any }>();
      for (const row of existingRes.rows) {
        const key = row.norm_phone || cleanPhoneNumber(row.phone_number);
        if (key && !existingMap.has(key)) {
          existingMap.set(key, {
            id: row.id,
            custom_metadata: row.custom_metadata || {},
          });
        }
      }

      let roundRobinReps: string[] = [];
      if (assignmentMode === "round_robin") {
        const repsRes = await client.query(
          "SELECT id FROM users WHERE tenant_id = $1 AND role = 'sales_rep' AND is_active = true",
          [tenantId]
        );
        roundRobinReps = repsRes.rows.map((r: any) => r.id);
      }

      let defaultTargetRep: string | null = null;
      if (assignmentMode === "specific" && assignToRepId && assignToRepId !== "unassigned") {
        if (!isValidUuid(assignToRepId)) {
          return NextResponse.json({ error: "Invalid assignToRepId" }, { status: 400 });
        }
        const userRes = await client.query(
          "SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true",
          [assignToRepId, tenantId]
        );
        if (userRes.rows.length > 0) {
          defaultTargetRep = userRes.rows[0].id;
        }
      }

      const startTime = Date.now();
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = batchDuplicatesCount;
      let pendingApprovalsCount = 0;

      const isRichMigration =
        sheetType !== "cold" ||
        batchLeads.some(
          (l) =>
            Boolean(l.remark) ||
            Boolean(l.email) ||
            Boolean(l.userId) ||
            Number(l.amount || 0) > 0 ||
            Number(l.credits || 0) > 0
        );

      await client.query("BEGIN");
      try {
        // Fast path for pure cold-calling lists (thousands of rows with no comments/deals)
        const hasAnyPerLeadUpdate = batchLeads.some((l) => l.duplicateAction === "update");
        if (!isRichMigration && defaultDuplicateAction === "skip" && !hasAnyPerLeadUpdate) {
          const newLeads = batchLeads.filter((l) => !existingMap.has(l.phone));
          skippedCount += batchLeads.length - newLeads.length;

          const BATCH_SIZE = 250;
          for (let b = 0; b < newLeads.length; b += BATCH_SIZE) {
            const chunk = newLeads.slice(b, b + BATCH_SIZE);
            const valueClauses: string[] = [];
            const params: any[] = [tenantId];
            let paramIdx = 2;

            for (let i = 0; i < chunk.length; i++) {
              const globalIdx = b + i;
              const l = chunk[i];
              const assignedId =
                roundRobinReps.length > 0
                  ? roundRobinReps[globalIdx % roundRobinReps.length]
                  : defaultTargetRep;

              valueClauses.push(
                `($1, $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, 'new', NOW(), NOW())`
              );
              params.push(
                assignedId,
                assignedId,
                assignedId ? new Date() : null,
                l.phone,
                l.name?.trim() || null,
                l.company?.trim() || null,
                l.vertical?.trim() || null,
                l.service?.trim() || null,
                l.source || "Vendor Cold List"
              );
              paramIdx += 9;
            }

            const insertSql = `
              INSERT INTO leads (
                tenant_id, assigned_rep_id, first_assigned_rep_id, first_assigned_at,
                phone_number, contact_name, company_name, business_vertical,
                service_type, source, status, created_at, updated_at
              )
              VALUES ${valueClauses.join(", ")}
              ON CONFLICT DO NOTHING
            `;
            const res = await client.query(insertSql, params);
            importedCount += res.rowCount || chunk.length;
          }
        } else {
          // Rich Google Sheet migration path (comments, stages, customer details, closed deals -> pending approval)
          for (let idx = 0; idx < batchLeads.length; idx++) {
            const l = batchLeads[idx];
            const stageInfo = mapStageToDb(l, sheetType);
            const existing = existingMap.get(l.phone);

            const assignedId =
              roundRobinReps.length > 0
                ? roundRobinReps[idx % roundRobinReps.length]
                : defaultTargetRep;
            const effectiveRepId = assignedId || uploaderId;

            const extraMeta: Record<string, any> = {};
            if (l.email?.trim()) extraMeta.email = l.email.trim();
            if (l.userId?.trim()) extraMeta.panelUserId = l.userId.trim();
            if (l.secondaryPhone?.trim()) extraMeta.secondaryPhone = l.secondaryPhone.trim();

            let leadId: string;

            if (existing) {
              const action = l.duplicateAction || defaultDuplicateAction;
              if (action === "skip" && !stageInfo.isClosedDeal) {
                skippedCount++;
                continue;
              }
              if (l.duplicateAction === "skip" && stageInfo.isClosedDeal) {
                skippedCount++;
                continue;
              }

              leadId = existing.id;
              const mergedMeta = { ...(existing.custom_metadata || {}), ...extraMeta };
              await client.query(
                `UPDATE leads
                 SET contact_name = COALESCE(NULLIF($1, ''), contact_name),
                     company_name = COALESCE(NULLIF($2, ''), company_name),
                     business_vertical = COALESCE(NULLIF($3, ''), business_vertical),
                     service_type = CASE
                       WHEN NULLIF($4, '') IS NULL THEN service_type
                       WHEN service_type IS NULL OR service_type = '' THEN $4
                       WHEN POSITION(LOWER($4) IN LOWER(service_type)) > 0 THEN service_type
                       ELSE service_type || ', ' || $4
                     END,
                     website_url = COALESCE(NULLIF($5, ''), website_url),
                     custom_metadata = $6::jsonb,
                     status = CASE WHEN $7 <> 'new' THEN $7 ELSE status END,
                     is_interested = CASE WHEN $7 = 'interested' THEN true ELSE COALESCE(is_interested, false) END,
                     updated_at = NOW()
                 WHERE id = $8 AND tenant_id = $9`,
                [
                  l.name?.trim() || "",
                  l.company?.trim() || "",
                  l.vertical?.trim() || "",
                  l.service?.trim() || "",
                  l.website?.trim() || "",
                  JSON.stringify(mergedMeta),
                  stageInfo.leadStatus,
                  leadId,
                  tenantId,
                ]
              );
              updatedCount++;
            } else {
              const leadDate = parseSheetDate(l.leadDate) || new Date();
              const insRes = await client.query(
                `INSERT INTO leads (
                   tenant_id, assigned_rep_id, first_assigned_rep_id, first_assigned_at,
                   phone_number, contact_name, company_name, business_vertical,
                   service_type, website_url, source, status, is_interested, custom_metadata, created_at, updated_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, NOW())
                 RETURNING id, custom_metadata`,
                [
                  tenantId,
                  assignedId,
                  assignedId,
                  assignedId ? new Date() : null,
                  l.phone,
                  l.name?.trim() || null,
                  l.company?.trim() || null,
                  l.vertical?.trim() || null,
                  l.service?.trim() || null,
                  l.website?.trim() || null,
                  l.source || "Google Sheet Migration",
                  stageInfo.leadStatus,
                  stageInfo.leadStatus === "interested",
                  JSON.stringify(extraMeta),
                  leadDate,
                ]
              );
              leadId = insRes.rows[0].id;
              existingMap.set(l.phone, { id: leadId, custom_metadata: extraMeta });
              importedCount++;
            }

            const eventDate = parseSheetDate(l.closeDate) || parseSheetDate(l.leadDate) || new Date();

            // Log remark / comment to lead_stage_history only (never call_logs) so sheet imports show in Lead Dossier without polluting Call Logs or Reports
            if (l.remark?.trim() || stageInfo.leadStatus !== "new") {
              const logRemark = l.remark?.trim() || `Imported from Google Sheet (${stageInfo.disposition})`;
              await client.query(
                `INSERT INTO lead_stage_history (
                   tenant_id, lead_id, rep_id, stage_name, stage_type, notes, metadata, created_at
                 )
                 VALUES ($1, $2, $3, $4, 'sheet_import', $5, $6::jsonb, $7)`,
                [
                  tenantId,
                  leadId,
                  effectiveRepId,
                  stageInfo.disposition,
                  logRemark,
                  JSON.stringify({ imported: true, sheetType }),
                  eventDate,
                ]
              ).catch(() => {});
            }

            // Closed Deal -> Create deal in 'payment_pending' + payment in 'pending_verification' for approval
            if (stageInfo.isClosedDeal) {
              const creditsVal = Number(l.credits || 0) || 0;
              const amountVal = Number(l.amount || 0) || 0;
              const serviceVal = l.service?.trim() || "WhatsApp API";

              // Guard against re-uploading the exact same deal (same phone + close date + amount + credits)
              const dupDealCheck = await client.query(
                `SELECT id FROM deals
                 WHERE lead_id = $1 AND tenant_id = $2
                   AND quantity = $3 AND quoted_price = $4
                   AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = DATE($5::timestamptz AT TIME ZONE 'Asia/Kolkata')
                 LIMIT 1`,
                [leadId, tenantId, creditsVal, amountVal, eventDate]
              );
              if (dupDealCheck.rows.length > 0) {
                skippedCount++;
                continue;
              }

              // Check if customer already has an earlier deal -> tag as Existing User (Top-Up / Recharge)
              const priorDealCheck = await client.query(
                `SELECT 1 FROM deals WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1`,
                [leadId, tenantId]
              );
              const userType = priorDealCheck.rows.length > 0 ? "Existing User" : "New User";

              const closingNotes = JSON.stringify({
                userId: l.userId?.trim() || null,
                mailId: l.email?.trim() || null,
                closeDate: l.closeDate?.trim() || null,
                leadDate: l.leadDate?.trim() || null,
                notes: l.remark?.trim() || "Imported Closed Deal (Pending Ops Approval)",
                importedFrom: "Google Sheet",
              });

              const dealRes = await client.query(
                `INSERT INTO deals (
                   tenant_id, lead_id, rep_id, service_type, quantity, quoted_price,
                   expected_closing_date, stage, closing_notes, created_at, updated_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $8::date, 'payment_pending', $7, $8::timestamptz, $8::timestamptz)
                 RETURNING id`,
                [
                  tenantId,
                  leadId,
                  effectiveRepId,
                  serviceVal,
                  creditsVal,
                  amountVal,
                  closingNotes,
                  eventDate,
                ]
              );

              const dealId = dealRes.rows[0].id;
              await client.query(
                `INSERT INTO payments (
                   tenant_id, deal_id, lead_id, rep_id, user_type, panel_user_id,
                   credits_to_add, original_amount, tax_amount, tds_amount, final_amount,
                   payment_mode, screenshot_url, ops_approval_status, credits_provisioned, created_at
                 )
                 VALUES ($1, $2, $3, $4, $9, $5, $6, $7::numeric, 0, 0, $7::numeric, 'Google Sheet Import', 'NA', 'pending_verification', false, $8::timestamptz)`,
                [
                  tenantId,
                  dealId,
                  leadId,
                  effectiveRepId,
                  l.userId?.trim() || null,
                  creditsVal,
                  amountVal,
                  eventDate,
                  userType,
                ]
              );
              pendingApprovalsCount++;
            } else if (stageInfo.leadStatus === "callback" || stageInfo.leadStatus === "demo_scheduled") {
              await client.query(
                `INSERT INTO scheduled_tasks (
                   tenant_id, lead_id, rep_id, task_type, scheduled_time, notes, status, task_source, created_at, updated_at
                 )
                 VALUES ($1, $2, $3, $4, NULL, $5, 'pending', 'manual', $6, NOW())`,
                [
                  tenantId,
                  leadId,
                  effectiveRepId,
                  stageInfo.leadStatus === "demo_scheduled" ? "product_demo" : "callback",
                  l.remark?.trim() || "Imported follow-up from Google Sheet",
                  eventDate,
                ]
              ).catch(() => {});
            }
          }
        }

        await client.query("COMMIT");
      } catch (insertErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw insertErr;
      }

      const durationMs = Date.now() - startTime;

      return NextResponse.json({
        imported: importedCount,
        updated: updatedCount,
        duplicates: skippedCount,
        pendingApprovals: pendingApprovalsCount,
        invalid: leads.length - validLeads.length,
        total: leads.length,
        durationMs,
      });
    });
  } catch (error: any) {
    console.error("[IMPORT]", error);
    return NextResponse.json(
      { error: "Failed to import leads" },
      { status: 500 }
    );
  }
}
